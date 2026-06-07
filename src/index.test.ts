import { beforeEach, describe, expect, it, spyFn, spyOn } from "@igorjs/pure-test";
import { run } from "./index";
import type { RunEnv } from "./config/types";

function makeEnv(): RunEnv & {
  mockDeleteRuns: ReturnType<typeof spyFn>;
  mockGetRunsToDelete: ReturnType<typeof spyFn>;
  mockGetMetrics: ReturnType<typeof spyFn>;
} {
  const mockDeleteRuns = spyFn<[number[]], Promise<{ succeeded: number; failed: number }>>();
  const mockGetRunsToDelete = spyFn();
  const mockGetMetrics = spyFn().mockReturnValue({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retries: 0,
    rateLimitHits: 0,
    circuitBreakerTrips: 0,
  });

  return {
    params: {
      getToken: spyFn().mockReturnValue("ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"),
      getOwner: spyFn().mockReturnValue("test-owner"),
      getRepo: spyFn().mockReturnValue("test-repo"),
      getRunsToKeep: spyFn().mockReturnValue(5),
      getRunsOlderThan: spyFn().mockReturnValue(7),
      getDryRun: spyFn().mockReturnValue(false),
      getWorkflowNames: spyFn().mockReturnValue([]),
    },
    getApi: spyFn().mockReturnValue({
      deleteRuns: mockDeleteRuns,
      getRunsToDelete: mockGetRunsToDelete,
      getMetrics: mockGetMetrics,
    }),
    setFailed: spyFn(),
    setOutput: spyFn(),
    mockDeleteRuns,
    mockGetRunsToDelete,
    mockGetMetrics,
  };
}

describe("index", () => {
  let infoSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    infoSpy = spyOn(console, "info").mockImplementation(() => {});
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  it("should successfully delete runs with workflow stats", async () => {
    const env = makeEnv();
    const workflowStats = new Map([
      [100, { total: 10, toDelete: 5 }],
      [200, { total: 8, toDelete: 3 }],
    ]);
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3, 4, 5, 6, 7, 8],
      totalRuns: 18,
      workflowStats,
    });
    env.mockDeleteRuns.mockResolvedValue({ succeeded: 8, failed: 0 });
    env.mockGetMetrics.mockReturnValue({
      totalRequests: 8, successfulRequests: 8, failedRequests: 0,
      retries: 0, rateLimitHits: 0, circuitBreakerTrips: 0,
    });

    await run(env);

    expect(env.params.getToken).toHaveBeenCalled();
    expect(env.getApi).toHaveBeenCalledWith({
      token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
      owner: "test-owner",
      repo: "test-repo",
      dryRun: false,
      workflowNames: [],
    });
    expect(env.mockGetRunsToDelete).toHaveBeenCalledWith(7, 5);
    expect(infoSpy).toHaveBeenCalledWith("INFO: Fetching workflow runs for test-owner/test-repo...");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Found 18 runs older than 7 days");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Workflow 100: keeping 5 runs, deleting 5 runs");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Workflow 200: keeping 5 runs, deleting 3 runs");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Deleting 8 total runs across all workflows...");
    expect(infoSpy).toHaveBeenCalledWith("SUCCESS: Deleted 8 runs");
    expect(env.mockDeleteRuns).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(env.setFailed).not.toHaveBeenCalled();
    expect(env.setOutput).toHaveBeenCalledWith("total-runs-found", "18");
    expect(env.setOutput).toHaveBeenCalledWith("runs-deleted", "8");
    expect(env.setOutput).toHaveBeenCalledWith("runs-failed", "0");
    expect(env.setOutput).toHaveBeenCalledWith("total-api-requests", "8");
    expect(env.setOutput).toHaveBeenCalledWith("successful-requests", "8");
  });

  it("should handle case with no runs to delete", async () => {
    const env = makeEnv();
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [], totalRuns: 5, workflowStats: new Map(),
    });
    await run(env);
    expect(infoSpy).toHaveBeenCalledWith("INFO: Found 5 runs older than 7 days");
    expect(infoSpy).toHaveBeenCalledWith("INFO: No runs to delete");
    expect(env.mockDeleteRuns).not.toHaveBeenCalled();
    expect(env.setFailed).not.toHaveBeenCalled();
    expect(env.setOutput).toHaveBeenCalledWith("total-runs-found", "5");
    expect(env.setOutput).toHaveBeenCalledWith("runs-deleted", "0");
    expect(env.setOutput).toHaveBeenCalledWith("runs-failed", "0");
  });

  it("should handle partial deletion failures and set action as failed", async () => {
    const env = makeEnv();
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3], totalRuns: 10,
      workflowStats: new Map([[100, { total: 10, toDelete: 3 }]]),
    });
    env.mockDeleteRuns.mockResolvedValue({ succeeded: 2, failed: 1 });
    env.mockGetMetrics.mockReturnValue({
      totalRequests: 3, successfulRequests: 2, failedRequests: 1,
      retries: 0, rateLimitHits: 0, circuitBreakerTrips: 0,
    });
    await run(env);
    expect(infoSpy).toHaveBeenCalledWith("SUCCESS: Deleted 2 runs");
    expect(warnSpy).toHaveBeenCalledWith("WARN: Failed to delete 1 runs");
    expect(env.setFailed).toHaveBeenCalledWith(
      "Failed to delete 1 out of 3 runs. Check logs for details."
    );
  });

  it("should handle dry-run mode", async () => {
    const env = makeEnv();
    (env.params.getDryRun as ReturnType<typeof spyFn>).mockReturnValue(true);
    const workflowStats = new Map([[100, { total: 5, toDelete: 3 }]]);
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3], totalRuns: 5, workflowStats,
    });
    env.mockDeleteRuns.mockResolvedValue({ succeeded: 3, failed: 0 });
    await run(env);
    expect(infoSpy).toHaveBeenCalledWith("INFO: DRY RUN MODE - No runs will be actually deleted");
    expect(env.getApi).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    expect(infoSpy).toHaveBeenCalledWith("INFO: Workflow 100: keeping 2 runs, would delete 3 runs");
    expect(infoSpy).toHaveBeenCalledWith("DRY RUN: Would have deleted 3 runs");
    expect(env.setFailed).not.toHaveBeenCalled();
  });

  it("should log workflow names filter when provided", async () => {
    const env = makeEnv();
    (env.params.getWorkflowNames as ReturnType<typeof spyFn>).mockReturnValue(["CI", "Deploy"]);
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2], totalRuns: 2, workflowStats: new Map(),
    });
    env.mockDeleteRuns.mockResolvedValue({ succeeded: 2, failed: 0 });
    await run(env);
    expect(infoSpy).toHaveBeenCalledWith("INFO: Filtering by workflows: CI, Deploy");
    expect(env.getApi).toHaveBeenCalledWith(
      expect.objectContaining({ workflowNames: ["CI", "Deploy"] })
    );
  });

  it("should log metrics at the end", async () => {
    const env = makeEnv();
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [1], totalRuns: 1, workflowStats: new Map(),
    });
    env.mockDeleteRuns.mockResolvedValue({ succeeded: 1, failed: 0 });
    env.mockGetMetrics.mockReturnValue({
      totalRequests: 5, successfulRequests: 4, failedRequests: 1,
      retries: 2, rateLimitHits: 1, circuitBreakerTrips: 0,
    });
    await run(env);
    expect(infoSpy).toHaveBeenCalledWith("INFO: === API Metrics ===");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Total API requests: 5");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Successful requests: 4");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Failed requests: 1");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Retry attempts: 2");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Rate limit hits: 1");
    expect(infoSpy).toHaveBeenCalledWith("INFO: Circuit breaker trips: 0");
  });

  it("should not log workflow stats when runsToKeep is 0", async () => {
    const env = makeEnv();
    (env.params.getRunsToKeep as ReturnType<typeof spyFn>).mockReturnValue(0);
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3], totalRuns: 3,
      workflowStats: new Map([[100, { total: 3, toDelete: 3 }]]),
    });
    env.mockDeleteRuns.mockResolvedValue({ succeeded: 3, failed: 0 });
    await run(env);
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining("Workflow"));
  });

  it("should not log workflow stats when workflowStats is empty", async () => {
    const env = makeEnv();
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3], totalRuns: 3, workflowStats: new Map(),
    });
    env.mockDeleteRuns.mockResolvedValue({ succeeded: 3, failed: 0 });
    await run(env);
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining("Workflow"));
  });

  it("should not log workflow stats when toDelete is 0", async () => {
    const env = makeEnv();
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [], totalRuns: 5,
      workflowStats: new Map([[100, { total: 5, toDelete: 0 }]]),
    });
    await run(env);
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining("Workflow 100"));
  });

  it("should handle parameter validation errors", async () => {
    const env = makeEnv();
    const error = new Error("[Invalid Parameter] <token> must be provided");
    (env.params as unknown as Record<string, unknown>).getToken = () => { throw error; };
    await run(env);
    expect(errorSpy).toHaveBeenCalledWith(error);
    expect(env.setFailed).toHaveBeenCalledWith("[Invalid Parameter] <token> must be provided");
    expect(env.getApi).not.toHaveBeenCalled();
  });

  it("should handle API errors during getRunsToDelete", async () => {
    const env = makeEnv();
    const error = new Error("GitHub API rate limit exceeded");
    env.mockGetRunsToDelete.mockRejectedValue(error);
    await run(env);
    expect(errorSpy).toHaveBeenCalledWith(error);
    expect(env.setFailed).toHaveBeenCalledWith("GitHub API rate limit exceeded");
    expect(env.mockDeleteRuns).not.toHaveBeenCalled();
  });

  it("should handle API errors during deleteRuns", async () => {
    const env = makeEnv();
    env.mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3], totalRuns: 3, workflowStats: new Map(),
    });
    env.mockDeleteRuns.mockRejectedValue(new Error("Network connection failed"));
    await run(env);
    expect(env.setFailed).toHaveBeenCalledWith("Network connection failed");
  });

  it("should handle errors without message property", async () => {
    const env = makeEnv();
    (env.params as unknown as Record<string, unknown>).getToken = () => { throw "String error"; };
    await run(env);
    expect(errorSpy).toHaveBeenCalledWith("String error");
    expect(env.setFailed).toHaveBeenCalledWith(undefined);
  });
});
