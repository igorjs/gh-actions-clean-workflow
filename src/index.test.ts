import { describe, test, expect, vi, beforeEach } from "vitest";
import { run } from "./index";

// Mock all dependencies
vi.mock("@actions/core");
vi.mock("./api");
vi.mock("./params");

import { setFailed } from "@actions/core";
import { getApi } from "./api";
import {
  getToken,
  getOwner,
  getRepo,
  getRunsToKeep,
  getRunsOlderThan,
} from "./params";

const mockSetFailed = vi.mocked(setFailed);
const mockGetApi = vi.mocked(getApi);
const mockGetToken = vi.mocked(getToken);
const mockGetOwner = vi.mocked(getOwner);
const mockGetRepo = vi.mocked(getRepo);
const mockGetRunsToKeep = vi.mocked(getRunsToKeep);
const mockGetRunsOlderThan = vi.mocked(getRunsOlderThan);

describe("index", () => {
  let mockDeleteRuns: ReturnType<typeof vi.fn>;
  let mockGetRunsToDelete: ReturnType<typeof vi.fn>;
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
    mockGetToken.mockReturnValue("test-token");
    mockGetOwner.mockReturnValue("test-owner");
    mockGetRepo.mockReturnValue("test-repo");
    mockGetRunsToKeep.mockReturnValue(5);
    mockGetRunsOlderThan.mockReturnValue(7);

    // Setup API mock
    mockDeleteRuns = vi.fn();
    mockGetRunsToDelete = vi.fn();
    mockGetApi.mockReturnValue({
      deleteRuns: mockDeleteRuns,
      getRunsToDelete: mockGetRunsToDelete,
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

    await run();

    expect(mockGetToken).toHaveBeenCalled();
    expect(mockGetOwner).toHaveBeenCalled();
    expect(mockGetRepo).toHaveBeenCalled();
    expect(mockGetRunsToKeep).toHaveBeenCalled();
    expect(mockGetRunsOlderThan).toHaveBeenCalled();

    expect(mockGetApi).toHaveBeenCalledWith({
      token: "test-token",
      owner: "test-owner",
      repo: "test-repo",
    });

    expect(mockGetRunsToDelete).toHaveBeenCalledWith(7, 5);

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
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Successfully deleted 8 runs"
    );

    expect(mockDeleteRuns).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8]);
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
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  test("should handle partial deletion failures", async () => {
    mockGetRunsToDelete.mockResolvedValue({
      runIds: [1, 2, 3],
      totalRuns: 10,
      workflowStats: new Map([[100, { total: 10, toDelete: 3 }]]),
    });

    mockDeleteRuns.mockResolvedValue({
      succeeded: 2,
      failed: 1,
    });

    await run();

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "INFO: Successfully deleted 2 runs"
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith("WARN: Failed to delete 1 runs");
    expect(mockSetFailed).not.toHaveBeenCalled();
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
    expect(mockSetFailed).toHaveBeenCalledWith("GitHub API rate limit exceeded");
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
