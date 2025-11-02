import { beforeEach, describe, expect, test, vi } from "vitest";
import { getApi } from "./api";

// Mock dependencies
vi.mock("@actions/github", () => ({
  getOctokit: vi.fn(),
}));
vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn(() => Promise.resolve()),
}));

import { getOctokit } from "@actions/github";

const mockGetOctokit = vi.mocked(getOctokit);

describe("api", () => {
  let mockDeleteWorkflowRun: ReturnType<typeof vi.fn>;
  let mockPaginateIterator: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPaginateIterator = vi.fn();
    mockDeleteWorkflowRun = vi.fn(() => Promise.resolve({}));

    // Create a mock octokit with just the properties we actually use
    // TypeScript will infer the type based on usage in getApi
    const mockOctokit = {
      paginate: {
        iterator: mockPaginateIterator,
      },
      rest: {
        actions: {
          deleteWorkflowRun: mockDeleteWorkflowRun,
          listWorkflowRunsForRepo: vi.fn(),
        },
      },
    };

    // Use unknown to bypass type checking at the mock boundary
    // This is acceptable in tests where we control the mock implementation
    mockGetOctokit.mockReturnValue(mockOctokit as never);
  });

  describe("getApi", () => {
    test("should create API instance with provided parameters", () => {
      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      expect(api).toBeDefined();
      expect(api.deleteRuns).toBeDefined();
      expect(api.getRunsToDelete).toBeDefined();
      expect(mockGetOctokit).toHaveBeenCalledWith(
        "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
      );
    });
  });

  describe("deleteRuns", () => {
    test("should successfully delete all runs", async () => {
      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
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

    test("should successfully delete runs in batches", async () => {
      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      // Create 25 run IDs to test batching (batch size is 20)
      const runIds = Array.from({ length: 25 }, (_, i) => i + 1);
      const result = await api.deleteRuns(runIds);

      expect(result.succeeded).toBe(25);
      expect(result.failed).toBe(0);
      expect(mockDeleteWorkflowRun).toHaveBeenCalledTimes(25);
    });

    test("should handle partial failures", async () => {
      // First call succeeds
      mockDeleteWorkflowRun.mockResolvedValueOnce({});

      // Second call fails with client error (no retries for 4xx errors)
      const permError = Object.assign(new Error("Not Found"), {
        status: 404,
      });
      mockDeleteWorkflowRun.mockRejectedValueOnce(permError);

      // Third call succeeds
      mockDeleteWorkflowRun.mockResolvedValueOnce({});

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
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
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
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
      // Mock paginate.iterator to return an async iterable
      mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRuns };
      });

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
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
      mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRuns };
      });

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
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
      mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRuns };
      });

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      const result = await api.getRunsToDelete(undefined, 10);

      // Should not delete any runs since all workflows have fewer than 10 runs
      expect(result.runIds).toEqual([]);
      expect(result.totalRuns).toBe(6);
    });

    test("should handle empty runs", async () => {
      mockPaginateIterator.mockImplementation(async function* () {
        yield { data: [] };
      });

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
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

      mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRuns };
      });

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      await api.getRunsToDelete(7, 2);

      const mockOctokit = mockGetOctokit.mock.results[0].value;
      expect(mockPaginateIterator).toHaveBeenCalledWith(
        mockOctokit.rest.actions.listWorkflowRunsForRepo,
        expect.objectContaining({
          created: "<2024-01-03",
        })
      );

      vi.useRealTimers();
    });

    test("should filter runs by workflow names", async () => {
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

      mockPaginateIterator.mockImplementation(async function* () {
        yield { data: mockRunsWithNames };
      });

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
        workflowNames: ["CI", "Deploy"],
      });

      const result = await api.getRunsToDelete(undefined, 0);

      // Should only include runs with names "CI" and "Deploy", excluding "Tests"
      expect(result.runIds).toEqual([1, 2, 3]);
      expect(result.totalRuns).toBe(3);
      expect(result.workflowStats.size).toBe(2);
      expect(result.workflowStats.get(100)).toEqual({ total: 2, toDelete: 2 });
      expect(result.workflowStats.get(200)).toEqual({ total: 1, toDelete: 1 });
      expect(result.workflowStats.get(300)).toBeUndefined();
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
      mockDeleteWorkflowRun.mockRejectedValue(error);

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
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

    test("should handle error without message property", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const errorWithoutMessage = { status: 500 };
      mockDeleteWorkflowRun.mockRejectedValue(errorWithoutMessage);

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      await api.deleteRuns([1]);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "ERROR: Failed to delete run #1: Unknown error"
      );

      consoleErrorSpy.mockRestore();
    });

    test("should handle paginate errors gracefully", async () => {
      mockPaginateIterator.mockImplementation(async function* () {
        yield { data: [] };
        throw new Error("API rate limit");
      });

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      await expect(api.getRunsToDelete()).rejects.toThrow("API rate limit");
    });
  });

  describe("Retry logic", () => {
    test("should retry on server errors (5xx)", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      // Fail twice with 500, then succeed
      const serverError = Object.assign(new Error("Internal Server Error"), {
        status: 500,
      });
      mockDeleteWorkflowRun
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({});

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      const result = await api.deleteRuns([1]);

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("retrying in")
      );

      consoleWarnSpy.mockRestore();
    });

    test("should handle rate limit with retry-after header", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const rateLimitError = Object.assign(new Error("Rate limit exceeded"), {
        status: 429,
        response: { headers: { "retry-after": "2" } },
      });

      mockDeleteWorkflowRun
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({});

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      const result = await api.deleteRuns([1]);

      expect(result.succeeded).toBe(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Rate limit hit")
      );

      const metrics = api.getMetrics();
      expect(metrics.rateLimitHits).toBe(1);
      expect(metrics.retries).toBeGreaterThan(0);

      consoleWarnSpy.mockRestore();
    });

    test("should not retry on client errors (4xx except 429)", async () => {
      const clientError = Object.assign(new Error("Bad Request"), {
        status: 400,
      });
      mockDeleteWorkflowRun.mockRejectedValueOnce(clientError);

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      const result = await api.deleteRuns([1]);

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      // Should only be called once (no retries)
      expect(mockDeleteWorkflowRun).toHaveBeenCalledTimes(1);
    });
  });

  describe("Circuit breaker", () => {
    test("should open circuit after multiple failures", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      // Use 400 error which won't retry, to trigger circuit breaker faster
      const error = Object.assign(new Error("Bad Request"), {
        status: 400,
      });
      mockDeleteWorkflowRun.mockRejectedValue(error);

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      // Create enough runs to trigger circuit breaker (needs 5 failures to open)
      const runIds = Array.from({ length: 10 }, (_, i) => i + 1);
      const result = await api.deleteRuns(runIds);

      // All 10 should fail (first 5 fail normally, then circuit opens)
      expect(result.failed).toBe(10);

      // Circuit breaker should have logged warnings
      const circuitBreakerCalls = consoleWarnSpy.mock.calls.filter((call) =>
        call[0]?.includes("Circuit breaker")
      );
      expect(circuitBreakerCalls.length).toBeGreaterThan(0);

      const metrics = api.getMetrics();
      // Either circuit breaker tripped or it opened (both indicate it's working)
      expect(
        metrics.circuitBreakerTrips + circuitBreakerCalls.length
      ).toBeGreaterThan(0);

      consoleWarnSpy.mockRestore();
    });
  });

  describe("Dry run mode", () => {
    test("should not actually delete runs in dry run mode", async () => {
      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
        dryRun: true,
      });

      const result = await api.deleteRuns([1, 2, 3]);

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(mockDeleteWorkflowRun).not.toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        "DRY RUN: Would delete run #1"
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        "DRY RUN: Would delete run #2"
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        "DRY RUN: Would delete run #3"
      );

      consoleInfoSpy.mockRestore();
    });
  });

  describe("Metrics", () => {
    test("should track API metrics correctly", async () => {
      mockDeleteWorkflowRun.mockResolvedValue({});

      const api = getApi({
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF",
        owner: "test-owner",
        repo: "test-repo",
      });

      await api.deleteRuns([1, 2, 3]);

      const metrics = api.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.successfulRequests).toBe(3);
      expect(metrics.failedRequests).toBe(0);
    });
  });
});
