import { describe, test, expect, vi, beforeEach } from "vitest";
import { run } from "./index";

// Mock all dependencies
vi.mock("@actions/core");
vi.mock("./lib/api");
vi.mock("./lib/params");

import { setFailed } from "@actions/core";
import { getApi } from "./lib/api";
import {
  getToken,
  getOwner,
  getRepo,
  getRunsToKeep,
  getRunsOlderThan,
  getDryRun,
} from "./lib/params";

const mockSetFailed = vi.mocked(setFailed);
const mockGetApi = vi.mocked(getApi);
const mockGetToken = vi.mocked(getToken);
const mockGetOwner = vi.mocked(getOwner);
const mockGetRepo = vi.mocked(getRepo);
const mockGetRunsToKeep = vi.mocked(getRunsToKeep);
const mockGetRunsOlderThan = vi.mocked(getRunsOlderThan);
const mockGetDryRun = vi.mocked(getDryRun);

describe("index", () => {
  let mockDeleteRuns: ReturnType<typeof vi.fn>;
  let mockGetRunsToDelete: ReturnType<typeof vi.fn>;
  let mockGetMetrics: ReturnType<typeof vi.fn>;
  let consoleInfoSpy: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup console spies
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Setup default param returns
    mockGetToken.mockReturnValue(
      "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
    );
    mockGetOwner.mockReturnValue("test-owner");
    mockGetRepo.mockReturnValue("test-repo");
    mockGetRunsToKeep.mockReturnValue(5);
    mockGetRunsOlderThan.mockReturnValue(7);
    mockGetDryRun.mockReturnValue(false);

    // Setup API mock
    mockDeleteRuns = vi.fn();
    mockGetRunsToDelete = vi.fn();
    mockGetMetrics = vi.fn().mockReturnValue({
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
    });

    mockGetApi.mockReturnValue({
      deleteRuns: mockDeleteRuns,
      getRunsToDelete: mockGetRunsToDelete,
      getMetrics: mockGetMetrics,
    });
  });

  test("should successfully delete runs with workflow stats", async () => {
    const workflowStats = new Map([
      [100, { total: 10, toDelete: 5 }],
      [200, { total: 8, toDelete: 3 }],
    ]);

    mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3, 4, 5, 6, 7, 8],
      totalRuns: 18,
      workflowStats,
    });

    mockDeleteRuns.mockResolvedValue({
      succeeded: 8,
      failed: 0,
    });

    mockGetMetrics.mockReturnValue({
      totalRequests: 8,
      successfulRequests: 8,
      failedRequests: 0,
      retries: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
    });

    await run();

    expect(mockGetToken).toHaveBeenCalled();
    expect(mockGetOwner).toHaveBeenCalled();
    expect(mockGetRepo).toHaveBeenCalled();
    expect(mockGetRunsToKeep).toHaveBeenCalled();
    expect(mockGetRunsOlderThan).toHaveBeenCalled();
    expect(mockGetDryRun).toHaveBeenCalled();

    expect(mockGetApi).toHaveBeenCalledWith({
      token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
      owner: "test-owner",
      repo: "test-repo",
      dryRun: false,
    });

    expect(mockGetRunsToDelete).toHaveBeenCalledWith(7, 5);

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Fetching workflow runs for test-owner/test-repo..."
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Found 18 runs older than 7 days"
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Workflow 100: keeping 5 runs, deleting 5 runs"
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Workflow 200: keeping 5 runs, deleting 3 runs"
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Deleting 8 total runs across all workflows..."
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith("SUCCESS: Deleted 8 runs");

    expect(mockDeleteRuns).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(mockGetMetrics).toHaveBeenCalled();
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("should handle case with no runs to delete", async () => {
    mockGetRunsToDelete.mockResolvedValue({
      runIds: [],
      totalRuns: 5,
      workflowStats: new Map(),
    });

    await run();

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Found 5 runs older than 7 days"
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith("INFO: No runs to delete");
    expect(mockDeleteRuns).not.toHaveBeenCalled();
    expect(mockGetMetrics).toHaveBeenCalled();
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("should handle partial deletion failures and set action as failed", async () => {
    mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3],
      totalRuns: 10,
      workflowStats: new Map([[100, { total: 10, toDelete: 3 }]]),
    });

    mockDeleteRuns.mockResolvedValue({
      succeeded: 2,
      failed: 1,
    });

    mockGetMetrics.mockReturnValue({
      totalRequests: 3,
      successfulRequests: 2,
      failedRequests: 1,
      retries: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
    });

    await run();

    expect(consoleInfoSpy).toHaveBeenCalledWith("SUCCESS: Deleted 2 runs");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "WARN: Failed to delete 1 runs"
    );
    expect(mockSetFailed).toHaveBeenCalledWith(
      "Failed to delete 1 out of 3 runs. Check logs for details."
    );
  });

  test("should handle dry-run mode", async () => {
    mockGetDryRun.mockReturnValue(true);

    const workflowStats = new Map([[100, { total: 5, toDelete: 3 }]]);

    mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3],
      totalRuns: 5,
      workflowStats,
    });

    mockDeleteRuns.mockResolvedValue({
      succeeded: 3,
      failed: 0,
    });

    await run();

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: DRY RUN MODE - No runs will be actually deleted"
    );
    expect(mockGetApi).toHaveBeenCalledWith({
      token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
      owner: "test-owner",
      repo: "test-repo",
      dryRun: true,
    });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Workflow 100: keeping 2 runs, would delete 3 runs"
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Would delete 3 total runs across all workflows..."
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "DRY RUN: Would have deleted 3 runs"
    );
    // Dry run should not set failed even with failures
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("should log metrics at the end", async () => {
    mockGetRunsToDelete.mockResolvedValue({
      runIds: [1],
      totalRuns: 1,
      workflowStats: new Map(),
    });

    mockDeleteRuns.mockResolvedValue({
      succeeded: 1,
      failed: 0,
    });

    mockGetMetrics.mockReturnValue({
      totalRequests: 5,
      successfulRequests: 4,
      failedRequests: 1,
      retries: 2,
      rateLimitHits: 1,
      circuitBreakerTrips: 0,
    });

    await run();

    expect(consoleInfoSpy).toHaveBeenCalledWith("INFO: === API Metrics ===");
    expect(consoleInfoSpy).toHaveBeenCalledWith("INFO: Total API requests: 5");
    expect(consoleInfoSpy).toHaveBeenCalledWith("INFO: Successful requests: 4");
    expect(consoleInfoSpy).toHaveBeenCalledWith("INFO: Failed requests: 1");
    expect(consoleInfoSpy).toHaveBeenCalledWith("INFO: Retry attempts: 2");
    expect(consoleInfoSpy).toHaveBeenCalledWith("INFO: Rate limit hits: 1");
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Circuit breaker trips: 0"
    );
  });

  test("should not log workflow stats when runsToKeep is 0", async () => {
    mockGetRunsToKeep.mockReturnValue(0);

    mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3],
      totalRuns: 3,
      workflowStats: new Map([[100, { total: 3, toDelete: 3 }]]),
    });

    mockDeleteRuns.mockResolvedValue({
      succeeded: 3,
      failed: 0,
    });

    await run();

    expect(consoleInfoSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Workflow")
    );
  });

  test("should not log workflow stats when workflowStats is empty", async () => {
    mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3],
      totalRuns: 3,
      workflowStats: new Map(),
    });

    mockDeleteRuns.mockResolvedValue({
      succeeded: 3,
      failed: 0,
    });

    await run();

    expect(consoleInfoSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Workflow")
    );
  });

  test("should not log workflow stats when toDelete is 0", async () => {
    mockGetRunsToDelete.mockResolvedValue({
      runIds: [],
      totalRuns: 5,
      workflowStats: new Map([[100, { total: 5, toDelete: 0 }]]),
    });

    await run();

    expect(consoleInfoSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Workflow 100")
    );
  });

  test("should handle parameter validation errors", async () => {
    const error = new Error("[Invalid Parameter] <token> must be provided");
    mockGetToken.mockImplementation(() => {
      throw error;
    });

    await run();

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    expect(mockSetFailed).toHaveBeenCalledWith(
      "[Invalid Parameter] <token> must be provided"
    );
    expect(mockGetApi).not.toHaveBeenCalled();
  });

  test("should handle API errors during getRunsToDelete", async () => {
    const error = new Error("GitHub API rate limit exceeded");
    mockGetRunsToDelete.mockRejectedValue(error);

    await run();

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    expect(mockSetFailed).toHaveBeenCalledWith(
      "GitHub API rate limit exceeded"
    );
    expect(mockDeleteRuns).not.toHaveBeenCalled();
  });

  test("should handle API errors during deleteRuns", async () => {
    mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3],
      totalRuns: 3,
      workflowStats: new Map(),
    });

    const error = new Error("Network connection failed");
    mockDeleteRuns.mockRejectedValue(error);

    await run();

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    expect(mockSetFailed).toHaveBeenCalledWith("Network connection failed");
  });

  test("should handle errors without message property", async () => {
    const error = "String error";
    mockGetToken.mockImplementation(() => {
      throw error;
    });

    await run();

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    expect(mockSetFailed).toHaveBeenCalledWith(undefined);
  });
});
