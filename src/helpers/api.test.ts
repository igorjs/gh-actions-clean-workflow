import { describe, test, expect, vi, beforeEach } from "vitest";
import { getApi } from "./api";
import { getOctokit } from "@actions/github";

// Mock dependencies
vi.mock("@actions/github");
vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn(() => Promise.resolve()),
}));

const mockGetOctokit = vi.mocked(getOctokit);

describe("api", () => {
  let mockOctokit: any;
  let mockPaginate: ReturnType<typeof vi.fn>;
  let mockDeleteWorkflowRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPaginate = vi.fn();
    mockDeleteWorkflowRun = vi.fn(() => Promise.resolve({}));

    mockOctokit = {
      paginate: mockPaginate,
      rest: {
        actions: {
          deleteWorkflowRun: mockDeleteWorkflowRun,
          listWorkflowRunsForRepo: vi.fn(),
        },
      },
    };

    mockGetOctokit.mockReturnValue(mockOctokit);
  });

  describe("getApi", () => {
    test("should create API instance with provided parameters", () => {
      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      expect(api).toBeDefined();
      expect(api.deleteRuns).toBeDefined();
      expect(api.getRunsToDelete).toBeDefined();
      expect(mockGetOctokit).toHaveBeenCalledWith("test-token");
    });
  });

  describe("deleteRuns", () => {
    test("should successfully delete all runs", async () => {
      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      const runIds = [1, 2, 3];
      const result = await api.deleteRuns(runIds);

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(mockDeleteWorkflowRun).toHaveBeenCalledTimes(3);
      expect(mockDeleteWorkflowRun).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        run_id: 1,
      });
    });

    test("should handle partial failures", async () => {
      mockDeleteWorkflowRun
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("API Error"))
        .mockResolvedValueOnce({});

      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      const runIds = [1, 2, 3];
      const result = await api.deleteRuns(runIds);

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
    });

    test("should return zero counts for empty array", async () => {
      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      const result = await api.deleteRuns([]);

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockDeleteWorkflowRun).not.toHaveBeenCalled();
    });
  });

  describe("getRunsToDelete", () => {
    const mockRuns = [
      { id: 1, workflow_id: 100, created_at: "2024-01-05T00:00:00Z" },
      { id: 2, workflow_id: 100, created_at: "2024-01-04T00:00:00Z" },
      { id: 3, workflow_id: 100, created_at: "2024-01-03T00:00:00Z" },
      { id: 4, workflow_id: 100, created_at: "2024-01-02T00:00:00Z" },
      { id: 5, workflow_id: 200, created_at: "2024-01-05T00:00:00Z" },
      { id: 6, workflow_id: 200, created_at: "2024-01-01T00:00:00Z" },
    ];

    test("should return all runs when runsToKeep is 0", async () => {
      mockPaginate.mockResolvedValue(mockRuns);

      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      const result = await api.getRunsToDelete(undefined, 0);

      expect(result.runIds).toEqual([1, 2, 3, 4, 5, 6]);
      expect(result.totalRuns).toBe(6);
      // When runsToKeep is 0, we still have workflow stats, but all runs are marked for deletion
      expect(result.workflowStats.size).toBe(2);
      expect(result.workflowStats.get(100)).toEqual({ total: 4, toDelete: 4 });
      expect(result.workflowStats.get(200)).toEqual({ total: 2, toDelete: 2 });
    });

    test("should keep specified number of runs per workflow", async () => {
      mockPaginate.mockResolvedValue(mockRuns);

      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      const result = await api.getRunsToDelete(undefined, 2);

      // Should keep runs 1,2 for workflow 100 and all runs for workflow 200 (since it only has 2)
      expect(result.runIds).toEqual([3, 4]);
      expect(result.totalRuns).toBe(6);
      expect(result.workflowStats.get(100)).toEqual({ total: 4, toDelete: 2 });
      expect(result.workflowStats.get(200)).toEqual({ total: 2, toDelete: 0 });
    });

    test("should handle workflows with fewer runs than runsToKeep", async () => {
      mockPaginate.mockResolvedValue(mockRuns);

      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      const result = await api.getRunsToDelete(undefined, 10);

      // Should not delete any runs since all workflows have fewer than 10 runs
      expect(result.runIds).toEqual([]);
      expect(result.totalRuns).toBe(6);
    });

    test("should handle empty runs", async () => {
      mockPaginate.mockResolvedValue([]);

      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      const result = await api.getRunsToDelete(undefined, 5);

      expect(result.runIds).toEqual([]);
      expect(result.totalRuns).toBe(0);
      expect(result.workflowStats.size).toBe(0);
    });

    test("should apply date filter when provided", async () => {
      const mockDate = new Date("2024-01-10T00:00:00Z");
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      mockPaginate.mockResolvedValue(mockRuns);

      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      await api.getRunsToDelete(7, 2);

      expect(mockPaginate).toHaveBeenCalledWith(
        mockOctokit.rest.actions.listWorkflowRunsForRepo,
        expect.objectContaining({
          created: "<2024-01-03",
        })
      );

      vi.useRealTimers();
    });
  });

  describe("Error handling", () => {
    test("should log error details when delete fails", async () => {
      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const error = new Error("Network error");
      (error as any).message = "Network error";
      mockDeleteWorkflowRun.mockRejectedValue(error);

      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      await api.deleteRuns([1]);

      expect(consoleInfoSpy).toHaveBeenCalledWith("INFO: Deleting run #1");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("ERROR: Failed to delete run #1:")
      );

      consoleInfoSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test("should handle paginate errors gracefully", async () => {
      mockPaginate.mockRejectedValue(new Error("API rate limit"));

      const api = getApi({
        token: "test-token",
        owner: "test-owner",
        repo: "test-repo",
      });

      await expect(api.getRunsToDelete()).rejects.toThrow("API rate limit");
    });
  });
});
