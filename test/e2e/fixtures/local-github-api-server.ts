// SPDX-License-Identifier: MIT
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { WorkflowRun } from "../../../src/config/types";

/**
 * The subset of GitHub's real raw REST API workflow-run shape this project's
 * `octokit.rest.actions.listWorkflowRunsForRepo` response items carry.
 * `src/lib/api.ts` only reads `id`, `workflow_id`, `created_at` and `name`
 * (the fields `WorkflowRun` already types), but real GitHub responses carry
 * many more fields, so extra fields are allowed through the index signature.
 */
export interface WorkflowRunApiShape extends WorkflowRun {
  [key: string]: unknown;
}

export interface LocalGithubApiServer {
  /** Binds port 0 and starts listening. Resolves with the bound port/url. */
  start(): Promise<{ port: number; url: string }>;
  /** Stops listening. Resolves once the underlying socket has closed. */
  stop(): Promise<void>;
  /** Configures the full workflow-run dataset served by the list endpoint. */
  setWorkflowRuns(runs: WorkflowRunApiShape[]): void;
  /**
   * Fails the Nth request (1-indexed, across all requests) with `status`.
   * When `retryAfter` is set, attaches a real `Retry-After` response header
   * carrying that value (GitHub's convention: a string of seconds).
   */
  scriptFailure(n: number, status: number, retryAfter?: string): void;
  /**
   * Clears the request counter and any scripted failures. Server stays up.
   * The current consumers isolate tests by starting a fresh server per
   * test instead, so this exists for a future test file that wants to
   * reuse one running server instance across multiple `it()`s (cheaper
   * than a restart) and still needs a clean per-test slate.
   */
  reset(): void;
  /** Total requests served since start() or since the last reset(). */
  requestCount(): number;
}

const GITHUB_DEFAULT_PER_PAGE = 30;
const RUNS_LIST_PATH_PATTERN = /\/repos\/[^/]+\/[^/]+\/actions\/runs$/;
const RUN_DELETE_PATH_PATTERN = /\/repos\/[^/]+\/[^/]+\/actions\/runs\/\d+$/;

export function createLocalGithubApiServer(): LocalGithubApiServer {
  let server: Server | null = null;
  let baseUrl = "";
  let workflowRuns: WorkflowRunApiShape[] = [];
  let requestTotal = 0;
  interface ScriptedFailure {
    status: number;
    retryAfter?: string;
  }
  const scriptedFailures = new Map<number, ScriptedFailure>();

  function buildPageUrl(pathname: string, perPage: number, page: number): string {
    const pageUrl = new URL(pathname, baseUrl);
    pageUrl.searchParams.set("per_page", String(perPage));
    pageUrl.searchParams.set("page", String(page));
    return pageUrl.toString();
  }

  function handleListRuns(res: ServerResponse, url: URL): void {
    const perPage = Number(url.searchParams.get("per_page")) || GITHUB_DEFAULT_PER_PAGE;
    const page = Number(url.searchParams.get("page")) || 1;
    const lastPage = Math.max(1, Math.ceil(workflowRuns.length / perPage));
    const start = (page - 1) * perPage;
    const pageItems = workflowRuns.slice(start, start + perPage);

    if (page < lastPage) {
      const nextLink = buildPageUrl(url.pathname, perPage, page + 1);
      const lastLink = buildPageUrl(url.pathname, perPage, lastPage);
      res.setHeader(
        "Link",
        `<${nextLink}>; rel="next", <${lastLink}>; rel="last"`
      );
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ total_count: workflowRuns.length, workflow_runs: pageItems })
    );
  }

  function handleDeleteRun(res: ServerResponse): void {
    res.writeHead(204);
    res.end();
  }

  function handleScriptedFailure(
    res: ServerResponse,
    failure: ScriptedFailure,
    requestNumber: number
  ): void {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (failure.retryAfter !== undefined) {
      headers["Retry-After"] = failure.retryAfter;
    }
    res.writeHead(failure.status, headers);
    res.end(JSON.stringify({ message: `Scripted failure for request #${requestNumber}` }));
  }

  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    requestTotal += 1;
    const requestNumber = requestTotal;
    const scriptedFailure = scriptedFailures.get(requestNumber);
    if (scriptedFailure !== undefined) {
      handleScriptedFailure(res, scriptedFailure, requestNumber);
      return;
    }

    const url = new URL(req.url ?? "/", baseUrl);

    if (req.method === "GET" && RUNS_LIST_PATH_PATTERN.test(url.pathname)) {
      handleListRuns(res, url);
      return;
    }

    if (req.method === "DELETE" && RUN_DELETE_PATH_PATTERN.test(url.pathname)) {
      handleDeleteRun(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Not Found" }));
  }

  return {
    start(): Promise<{ port: number; url: string }> {
      return new Promise((resolve, reject) => {
        server = createServer(handleRequest);
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server?.address() as AddressInfo | null;
          if (!address) {
            reject(new Error("Failed to bind local GitHub API server"));
            return;
          }
          baseUrl = `http://127.0.0.1:${address.port}`;
          resolve({ port: address.port, url: baseUrl });
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        const activeServer = server;
        server = null;
        activeServer.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },

    setWorkflowRuns(runs: WorkflowRunApiShape[]): void {
      workflowRuns = runs;
    },

    scriptFailure(n: number, status: number, retryAfter?: string): void {
      scriptedFailures.set(n, { status, retryAfter });
    },

    reset(): void {
      requestTotal = 0;
      scriptedFailures.clear();
    },

    requestCount(): number {
      return requestTotal;
    },
  };
}
