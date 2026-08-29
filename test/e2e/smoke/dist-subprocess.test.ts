// SPDX-License-Identifier: MIT
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeWorkflowRuns } from "../../lib/api.test-helpers";
import {
  createLocalGithubApiServer,
  type LocalGithubApiServer,
} from "../fixtures/local-github-api-server";

/**
 * Spawns the real, minified `dist/index.js` produced by `pnpm run build`
 * against a local mock GitHub API server, and asserts on its real exit code
 * and real `GITHUB_OUTPUT` file. This proves the compiled artifact, not
 * just the unit-tested source, behaves correctly end to end: pagination,
 * retry/circuit-breaker logic, and output writing all survive esbuild's
 * bundling and minification.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const distEntry = path.resolve(repoRoot, "dist/index.js");
const TEST_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF";

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  output: Record<string, string>;
}

/**
 * Parses the real `@actions/core` v3 GITHUB_OUTPUT file-command format,
 * confirmed empirically by inspecting a real spawned run's output file:
 * `key<<ghadelimiter_<uuid>\nvalue\nghadelimiter_<uuid>\n` per entry, one
 * heredoc block per `setOutput` call. All values this action writes are
 * single-line numeric strings, so a non-greedy multiline match is enough.
 */
function parseGithubOutput(raw: string): Record<string, string> {
  const entryPattern = /^([\w.-]+)<<(\S+)\r?\n([\s\S]*?)\r?\n\2$/gm;
  const values: Record<string, string> = {};
  for (const match of raw.matchAll(entryPattern)) {
    const [, key, , value] = match;
    if (key) values[key] = value ?? "";
  }
  return values;
}

function makeGithubOutputPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "wu-g-github-output-"));
  const outputPath = path.join(dir, "github_output.txt");
  writeFileSync(outputPath, "");
  return outputPath;
}

describe("dist/index.js subprocess smoke test", () => {
  let server: LocalGithubApiServer;
  let apiUrl: string;
  let child: ChildProcess | null = null;

  beforeEach(async () => {
    server = createLocalGithubApiServer();
    const started = await server.start();
    apiUrl = started.url;
  });

  afterEach(async () => {
    if (child && child.exitCode === null && !child.killed) child.kill();
    child = null;
    await server.stop();
  });

  async function runAction(
    overrides: Record<string, string>
  ): Promise<RunResult> {
    const outputPath = overrides["GITHUB_OUTPUT"] ?? makeGithubOutputPath();

    const { code, stdout, stderr } = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      child = spawn(process.execPath, [distEntry], {
        env: {
          ...process.env,
          INPUT_TOKEN: TEST_TOKEN,
          INPUT_OWNER: "test-owner",
          INPUT_REPO: "test-repo",
          INPUT_RUNS_OLDER_THAN: "0",
          INPUT_RUNS_TO_KEEP: "0",
          INPUT_WORKFLOW_NAMES: "",
          INPUT_DRY_RUN: "false",
          GITHUB_API_URL: apiUrl,
          GITHUB_OUTPUT: outputPath,
          ...overrides,
        },
        cwd: repoRoot,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.once("error", reject);
      // Await close, not exit: close fires only once stdio is fully
      // flushed, so stdout/stderr and the GITHUB_OUTPUT file are safe to
      // read after it resolves.
      child.once("close", (exitCode) => {
        resolve({ code: exitCode, stdout, stderr });
      });
    });

    const output = parseGithubOutput(readFileSync(outputPath, "utf8"));
    return { code, stdout, stderr, output };
  }

  describe("Scenario 1: pagination and dry-run output", () => {
    it("accumulates every run across a real multi-page GET in dry-run mode", async () => {
      const runs = makeWorkflowRuns({ count: 150, workflowIdCount: 3 });
      server.setWorkflowRuns(runs);

      const result = await runAction({
        INPUT_DRY_RUN: "true",
        INPUT_RUNS_TO_KEEP: "0",
      });

      expect(result.code).toBe(0);
      expect(result.output["total-runs-found"]).toBe("150");
      expect(result.output["runs-deleted"]).toBe("150");
      expect(result.output["runs-failed"]).toBe("0");
      // Real Link-header pagination at the real per_page:100 this action
      // requests: 150 runs spans exactly 2 GET pages.
      expect(server.requestCount()).toBe(2);
    });

    it("recovers a scripted 429 through the real minified withRetry/isRateLimitError path", async () => {
      // GET (list) calls are never wrapped in withRetry in this codebase,
      // only deleteRunById is: scripting the 429 on the first GET was
      // verified empirically to fail the run immediately with zero
      // retries. Scripting it on the first DELETE instead exercises the
      // real retry/rate-limit code path through the compiled bundle. The
      // mock server attaches a real Retry-After: 1 header, so retry.ts's
      // handleRateLimitError computes a real 1s wait instead of falling
      // back to the production DEFAULT_RATE_LIMIT_WAIT_MS (60s) default.
      server.setWorkflowRuns(makeWorkflowRuns({ count: 1 }));
      server.scriptFailure(2, 429, "1"); // request #1 = GET list, #2 = first DELETE

      const result = await runAction({
        INPUT_DRY_RUN: "false",
        INPUT_RUNS_TO_KEEP: "0",
      });

      expect(result.code).toBe(0);
      expect(result.output["total-runs-found"]).toBe("1");
      expect(result.output["runs-deleted"]).toBe("1");
      expect(result.output["runs-failed"]).toBe("0");
      expect(result.output["rate-limit-hits"]).toBe("1");
      expect(result.output["retry-attempts"]).toBe("1");
    });
  });

  describe("Scenario 2: circuit-breaker trip", () => {
    it("trips the circuit breaker exactly once after 5 client-error deletes", async () => {
      // 5 runs, single page, so the GET list is request #1 and the 5
      // concurrent DELETE calls are requests #2-#6, ALL scripted to fail
      // with 400 (a non-retryable client error). Every one of them calls
      // circuitBreaker.recordFailure(), which is order-independent: unlike
      // an earlier version of this test that mixed a 6th, unscripted
      // success into the same batch, recordSuccess() resets failureCount
      // to 0 unconditionally (circuit-breaker.ts's recordSuccess), so a
      // success landing before all 5 failures had been recorded could
      // silently prevent the trip. With no success in this batch at all,
      // failureCount monotonically reaches CIRCUIT_BREAKER_CONFIG
      // .FAILURE_THRESHOLD (5) regardless of the real concurrent HTTP
      // calls' settle order, making the trip deterministic by construction
      // rather than by empirical luck.
      server.setWorkflowRuns(makeWorkflowRuns({ count: 5 }));
      server.scriptFailure(2, 400);
      server.scriptFailure(3, 400);
      server.scriptFailure(4, 400);
      server.scriptFailure(5, 400);
      server.scriptFailure(6, 400);

      const result = await runAction({
        INPUT_DRY_RUN: "false",
        INPUT_RUNS_TO_KEEP: "0",
      });

      // failed > 0 && !dryRun calls setFailed, so the real process exits
      // non-zero here; this is not the success-path scenario.
      expect(result.code).not.toBe(0);
      expect(result.output["total-runs-found"]).toBe("5");
      expect(result.output["runs-deleted"]).toBe("0");
      expect(result.output["runs-failed"]).toBe("5");
      expect(result.output["circuit-breaker-trips"]).toBe("1");
      expect(server.requestCount()).toBe(6);
    });
  });
});
