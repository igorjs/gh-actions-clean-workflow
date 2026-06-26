// SPDX-License-Identifier: MIT
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { makeApi } from "./api";

function makeTestDeps() {
  const mockDeleteWorkflowRun = vi
    .fn<[{ owner: string; repo: string; run_id: number }], Promise<object>>()
    .mockResolvedValue({});

  const mockPaginateIterator = vi.fn();

  const mockOctokit = {
    paginate: { iterator: mockPaginateIterator },
    rest: {
      actions: {
        deleteWorkflowRun: mockDeleteWorkflowRun,
        listWorkflowRunsForRepo: vi.fn(),
      },
    },
  };

  const sleep = vi.fn<[number], Promise<void>>().mockResolvedValue(undefined);
  const getOctokit = vi.fn().mockReturnValue(mockOctokit);
  const now = vi.fn().mockReturnValue(Date.now());

  return {
    sleep,
    getOctokit,
    now,
    mockDeleteWorkflowRun,
    mockPaginateIterator,
    mockOctokit,
  };
}

const TEST_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF";
const BASE_PARAMS = {
  token: TEST_TOKEN,
  owner: "test-owner",
  repo: "test-repo",
};

describe("api", () => {
  describe("makeApi / getApi", () => {
    it("should create API instance with provided parameters", () => {
      const deps = makeTestDeps();
      const api = makeApi(deps)(BASE_PARAMS);
      expect(api).toBeDefined();
      expect(api.deleteRuns).toBeDefined();
      expect(api.getRunsToDelete).toBeDefined();
      expect(deps.getOctokit).toHaveBeenCalledWith(TEST_TOKEN);
    });
  });

  describe("deleteRuns", () => {
    it("should successfully delete all runs", async () => {
      const deps = makeTestDeps();
      const api = makeApi(deps)(BASE_PARAMS);
      const result = await api.deleteRuns([1, 2, 3]);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(deps.mockDeleteWorkflowRun).toHaveBeenCalledTimes(3);
      expect(deps.mockDeleteWorkflowRun).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        run_id: 1,
      });
    });

    it("should successfully delete runs in batches", async () => {
      const deps = makeTestDeps();
      const api = makeApi(deps)(BASE_PARAMS);
      const runIds = Array.from({ length: 25 }, (_, i) => i + 1);
      const result = await api.deleteRuns(runIds);
      expect(result.succeeded).toBe(25);
      expect(result.failed).toBe(0);
      expect(deps.mockDeleteWorkflowRun).toHaveBeenCalledTimes(25);
    });

    it("should handle partial failures", async () => {
      const deps = makeTestDeps();
      deps.mockDeleteWorkflowRun.mockResolvedValueOnce({});
      const permError = Object.assign(new Error("Not Found"), { status: 404 });
      deps.mockDeleteWorkflowRun.mockRejectedValueOnce(permError);
      deps.mockDeleteWorkflowRun.mockResolvedValueOnce({});
      const api = makeApi(deps)(BASE_PARAMS);
      const result = await api.deleteRuns([1, 2, 3]);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
    });

    it("should return zero counts for empty array", async () => {
      const deps = makeTestDeps();
      const api = makeApi(deps)(BASE_PARAMS);
      const result = await api.deleteRuns([]);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(deps.mockDeleteWorkflowRun).not.toHaveBeenCalled();
    });
  });

  describe("getRunsToDelete", () => {
    const mockRuns = [
      { id: 1, workflow_id: 100, created_at: "2024-01-05T00:00:00Z", name: "" },
      { id: 2, workflow_id: 100, created_at: "2024-01-04T00:00:00Z", name: "" },
      { id: 3, workflow_id: 100, created_at: "2024-01-03T00:00:00Z", name: "" },
      { id: 4, workflow_id: 100, created_at: "2024-01-02T00:00:00Z", name: "" },
      { id: 5, workflow_id: 200, created_at: "2024-01-05T00:00:00Z", name: "" },
      { id: 6, workflow_id: 200, created_at: "2024-01-01T00:00:00Z", name: "" },
    ];

    it("should return all runs when runsToKeep is 0", async () => {
      const deps = makeTestDeps();
      deps.mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRuns };
      });
      const result = await makeApi(deps)(BASE_PARAMS).getRunsToDelete(
        undefined,
        0
      );
      expect(result.runIds).toEqual([1, 2, 3, 4, 5, 6]);
      expect(result.totalRuns).toBe(6);
      expect(result.workflowStats.get(100)).toEqual({ total: 4, toDelete: 4 });
      expect(result.workflowStats.get(200)).toEqual({ total: 2, toDelete: 2 });
    });

    it("should keep specified number of runs per workflow", async () => {
      const deps = makeTestDeps();
      deps.mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRuns };
      });
      const result = await makeApi(deps)(BASE_PARAMS).getRunsToDelete(
        undefined,
        2
      );
      expect(result.runIds).toEqual([3, 4]);
      expect(result.workflowStats.get(100)).toEqual({ total: 4, toDelete: 2 });
      expect(result.workflowStats.get(200)).toEqual({ total: 2, toDelete: 0 });
    });

    it("should handle workflows with fewer runs than runsToKeep", async () => {
      const deps = makeTestDeps();
      deps.mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRuns };
      });
      const result = await makeApi(deps)(BASE_PARAMS).getRunsToDelete(
        undefined,
        10
      );
      expect(result.runIds).toEqual([]);
      expect(result.totalRuns).toBe(6);
    });

    it("should handle empty runs", async () => {
      const deps = makeTestDeps();
      deps.mockPaginateIterator.mockImplementation(async function* () {
        yield { data: [] };
      });
      const result = await makeApi(deps)(BASE_PARAMS).getRunsToDelete(
        undefined,
        5
      );
      expect(result.runIds).toEqual([]);
      expect(result.totalRuns).toBe(0);
      expect(result.workflowStats.size).toBe(0);
    });

    it("should apply date filter when provided", async () => {
      const deps = makeTestDeps();
      // Inject a fixed "now"; no clock faking needed
      deps.now.mockReturnValue(new Date("2024-01-10T00:00:00Z").getTime());
      deps.mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRuns };
      });
      await makeApi(deps)(BASE_PARAMS).getRunsToDelete(7, 2);
      expect(deps.mockPaginateIterator).toHaveBeenCalledWith(
        deps.mockOctokit.rest.actions.listWorkflowRunsForRepo,
        expect.objectContaining({ created: "<2024-01-03" })
      );
    });

    it("should filter runs by workflow names", async () => {
      const deps = makeTestDeps();
      const mockRunsWithNames = [
        {
          id: 1,
          workflow_id: 100,
          created_at: "2024-01-05T00:00:00Z",
          name: "CI",
        },
        {
          id: 2,
          workflow_id: 100,
          created_at: "2024-01-04T00:00:00Z",
          name: "CI",
        },
        {
          id: 3,
          workflow_id: 200,
          created_at: "2024-01-03T00:00:00Z",
          name: "Deploy",
        },
        {
          id: 4,
          workflow_id: 300,
          created_at: "2024-01-02T00:00:00Z",
          name: "Tests",
        },
      ];
      deps.mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRunsWithNames };
      });
      const result = await makeApi(deps)({
        ...BASE_PARAMS,
        workflowNames: ["CI", "Deploy"],
      }).getRunsToDelete(undefined, 0);
      expect(result.runIds).toEqual([1, 2, 3]);
      expect(result.totalRuns).toBe(3);
      expect(result.workflowStats.get(300)).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    let infoSpy: MockInstance;
    let errorSpy: MockInstance;

    beforeEach(() => {
      infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should log error details when delete fails", async () => {
      const deps = makeTestDeps();
      deps.mockDeleteWorkflowRun.mockRejectedValue(new Error("Network error"));
      await makeApi(deps)(BASE_PARAMS).deleteRuns([1]);
      expect(infoSpy).toHaveBeenCalledWith("INFO: Deleting run #1");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("ERROR: Failed to delete run #1:")
      );
    });

    it("should handle error without message property", async () => {
      const deps = makeTestDeps();
      deps.mockDeleteWorkflowRun.mockRejectedValue({ status: 500 });
      await makeApi(deps)(BASE_PARAMS).deleteRuns([1]);
      expect(errorSpy).toHaveBeenCalledWith(
        "ERROR: Failed to delete run #1: Unknown error"
      );
    });

    it("should handle paginate errors gracefully", async () => {
      const deps = makeTestDeps();
      deps.mockPaginateIterator.mockImplementation(async function* () {
        yield { data: [] };
        throw new Error("API rate limit");
      });
      let caughtError: Error | undefined;
      try {
        await makeApi(deps)(BASE_PARAMS).getRunsToDelete();
      } catch (err) {
        caughtError = err as Error;
      }
      expect(caughtError?.message).toBe("API rate limit");
    });
  });

  describe("Retry logic", () => {
    it("should retry on server errors (5xx)", async () => {
      const deps = makeTestDeps();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const serverError = Object.assign(new Error("Internal Server Error"), {
        status: 500,
      });
      deps.mockDeleteWorkflowRun
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({});
      const result = await makeApi(deps)(BASE_PARAMS).deleteRuns([1]);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("retrying in")
      );
      warnSpy.mockRestore();
    });

    it("should handle rate limit with retry-after header", async () => {
      const deps = makeTestDeps();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const rateLimitError = Object.assign(new Error("Rate limit exceeded"), {
        status: 429,
        response: { headers: { "retry-after": "2" } },
      });
      deps.mockDeleteWorkflowRun
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({});
      const api = makeApi(deps)(BASE_PARAMS);
      const result = await api.deleteRuns([1]);
      expect(result.succeeded).toBe(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Rate limit hit")
      );
      const metrics = api.getMetrics();
      expect(metrics.rateLimitHits).toBe(1);
      expect(metrics.retries).toBeGreaterThan(0);
      warnSpy.mockRestore();
    });

    it("should not retry on client errors (4xx except 429)", async () => {
      const deps = makeTestDeps();
      const clientError = Object.assign(new Error("Bad Request"), {
        status: 400,
      });
      deps.mockDeleteWorkflowRun.mockRejectedValueOnce(clientError);
      const result = await makeApi(deps)(BASE_PARAMS).deleteRuns([1]);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(deps.mockDeleteWorkflowRun).toHaveBeenCalledTimes(1);
    });
  });

  describe("Circuit breaker", () => {
    it("should open circuit after multiple failures", async () => {
      const deps = makeTestDeps();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = Object.assign(new Error("Bad Request"), { status: 400 });
      deps.mockDeleteWorkflowRun.mockRejectedValue(error);
      const api = makeApi(deps)(BASE_PARAMS);
      const runIds = Array.from({ length: 10 }, (_, i) => i + 1);
      const result = await api.deleteRuns(runIds);
      expect(result.failed).toBe(10);
      const circuitBreakerCalls = warnSpy.mock.calls.filter((call) =>
        call[0]?.includes("Circuit breaker")
      );
      expect(circuitBreakerCalls.length).toBeGreaterThan(0);
      warnSpy.mockRestore();
    });
  });

  describe("Dry run mode", () => {
    it("should not actually delete runs in dry run mode", async () => {
      const deps = makeTestDeps();
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const api = makeApi(deps)({ ...BASE_PARAMS, dryRun: true });
      const result = await api.deleteRuns([1, 2, 3]);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(deps.mockDeleteWorkflowRun).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith("DRY RUN: Would delete run #1");
      expect(infoSpy).toHaveBeenCalledWith("DRY RUN: Would delete run #2");
      expect(infoSpy).toHaveBeenCalledWith("DRY RUN: Would delete run #3");
      infoSpy.mockRestore();
    });
  });

  describe("Metrics", () => {
    it("should track API metrics correctly", async () => {
      const deps = makeTestDeps();
      const api = makeApi(deps)(BASE_PARAMS);
      await api.deleteRuns([1, 2, 3]);
      const metrics = api.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.successfulRequests).toBe(3);
      expect(metrics.failedRequests).toBe(0);
    });
  });
});
