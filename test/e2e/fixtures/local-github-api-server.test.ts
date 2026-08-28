// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLocalGithubApiServer,
  type LocalGithubApiServer,
  type WorkflowRunApiShape,
} from "./local-github-api-server";

function makeRun(id: number): WorkflowRunApiShape {
  return {
    id,
    workflow_id: 100,
    created_at: "2024-01-01T00:00:00Z",
    name: "CI",
  };
}

const RUNS_PATH = "/repos/test-owner/test-repo/actions/runs";

describe("local github api server", () => {
  let server: LocalGithubApiServer;
  let baseUrl: string;
  let boundPort: number;

  beforeEach(async () => {
    server = createLocalGithubApiServer();
    const started = await server.start();
    baseUrl = started.url;
    boundPort = started.port;
  });

  afterEach(async () => {
    await server.stop();
  });

  it("binds to a real port on start", () => {
    expect(boundPort).toBeGreaterThan(0);
    expect(baseUrl).toBe(`http://127.0.0.1:${boundPort}`);
  });

  it("serves a paginated workflow_runs response with a rel=next Link header on page 1", async () => {
    const runs = Array.from({ length: 12 }, (_, i) => makeRun(i + 1));
    server.setWorkflowRuns(runs);

    const response = await fetch(`${baseUrl}${RUNS_PATH}?per_page=5&page=1`);
    const body = (await response.json()) as {
      total_count: number;
      workflow_runs: WorkflowRunApiShape[];
    };

    expect(response.status).toBe(200);
    expect(body.total_count).toBe(12);
    expect(body.workflow_runs).toHaveLength(5);
    expect(body.workflow_runs[0]).toMatchObject({
      id: 1,
      workflow_id: 100,
      created_at: "2024-01-01T00:00:00Z",
      name: "CI",
    });

    const linkHeader = response.headers.get("link");
    expect(linkHeader).toContain('rel="next"');
    expect(linkHeader).toContain("page=2");
  });

  it("omits rel=next from the Link header on the last page", async () => {
    const runs = Array.from({ length: 12 }, (_, i) => makeRun(i + 1));
    server.setWorkflowRuns(runs);

    const response = await fetch(`${baseUrl}${RUNS_PATH}?per_page=5&page=3`);
    const body = (await response.json()) as { workflow_runs: WorkflowRunApiShape[] };

    expect(body.workflow_runs).toHaveLength(2);
    const linkHeader = response.headers.get("link");
    expect(linkHeader === null || !linkHeader.includes('rel="next"')).toBe(true);
  });

  it("returns the scripted status code on the Nth request", async () => {
    server.scriptFailure(2, 429);

    const first = await fetch(`${baseUrl}${RUNS_PATH}`);
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}${RUNS_PATH}`);
    expect(second.status).toBe(429);
    const body = (await second.json()) as { message: string };
    expect(body.message).toBeDefined();
  });

  it("clears the request counter and scripted failures on reset, independent of a restart", async () => {
    server.scriptFailure(1, 500);
    const failing = await fetch(`${baseUrl}${RUNS_PATH}`);
    expect(failing.status).toBe(500);
    expect(server.requestCount()).toBe(1);

    server.reset();
    expect(server.requestCount()).toBe(0);

    const afterReset = await fetch(`${baseUrl}${RUNS_PATH}`);
    expect(afterReset.status).toBe(200);
    expect(server.requestCount()).toBe(1);
  });

  it("returns 204 with an empty body for a successful delete", async () => {
    const response = await fetch(`${baseUrl}${RUNS_PATH}/123`, {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    const text = await response.text();
    expect(text).toBe("");
  });

  it("stop() resolves cleanly and further requests are refused", async () => {
    await server.stop();
    await expect(fetch(`${baseUrl}${RUNS_PATH}`)).rejects.toThrow();
  });
});
