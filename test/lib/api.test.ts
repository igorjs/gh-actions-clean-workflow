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
import { CIRCUIT_BREAKER_CONFIG } from "#src/core/circuit-breaker";
import { BATCH_CONFIG, makeApi } from "#src/lib/api";
import { makeHttpError, makeWorkflowRuns } from "./api.test-helpers";

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

/**
 * Splits a flat list into fixed-size pages, mirroring how real paginated
 * GitHub API responses (per_page: 100) arrive as multiple `response.data`
 * yields from octokit.paginate.iterator.
 */
function chunkRuns<T>(items: T[], pageSize: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
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

    it("should pace once between batches (delay * batch size), not once per deletion", async () => {
      // Regression test: the delay used to live inside each concurrent
      // per-run task, where it overlapped across the whole batch and had
      // no effect on real throughput (see constants.ts RATE_LIMIT_DELAY_MS).
      const deps = makeTestDeps();
      const api = makeApi(deps)(BASE_PARAMS);
      const runIds = Array.from({ length: 25 }, (_, i) => i + 1); // 2 batches of 20 + 5
      await api.deleteRuns(runIds);

      // One pacing sleep between the two batches, not one per run and not
      // one after the final (fifth) batch.
      const pacingSleepCalls = deps.sleep.mock.calls.filter(
        ([ms]) => ms === 350 * 20
      );
      expect(pacingSleepCalls).toHaveLength(1);
    });

    it("should not pace between batches in dry-run mode", async () => {
      const deps = makeTestDeps();
      const api = makeApi(deps)({ ...BASE_PARAMS, dryRun: true });
      const runIds = Array.from({ length: 25 }, (_, i) => i + 1);
      await api.deleteRuns(runIds);

      const pacingSleepCalls = deps.sleep.mock.calls.filter(
        ([ms]) => ms === 350 * 20
      );
      expect(pacingSleepCalls).toHaveLength(0);
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

    it("should count circuit-breaker-trips once per open transition, not once per skipped run", async () => {
      // Regression test: circuitBreakerTrips used to increment once per run
      // skipped while the circuit was already OPEN, so one trip mid-batch
      // could report a value like 12 instead of 1.
      const deps = makeTestDeps();
      const clientError = Object.assign(new Error("bad request"), {
        status: 400,
      });
      deps.mockDeleteWorkflowRun.mockRejectedValue(clientError);
      const api = makeApi(deps)(BASE_PARAMS);

      // 25 runs = one batch of 20 (all immediate client-error failures;
      // FAILURE_THRESHOLD is 5, so the breaker trips to OPEN partway
      // through) + a second batch of 5 that deleteRuns short-circuits as
      // failed once it observes the breaker is OPEN after batch one.
      const runIds = Array.from({ length: 25 }, (_, i) => i + 1);
      const result = await api.deleteRuns(runIds);

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(25);
      expect(api.getMetrics().circuitBreakerTrips).toBe(1);
    });

    it.each([
      { n: BATCH_CONFIG.BATCH_SIZE, label: "exactly one full batch" },
      {
        n: BATCH_CONFIG.BATCH_SIZE + 1,
        label: "one full batch plus a short-circuited trailing run",
      },
      {
        n: BATCH_CONFIG.BATCH_SIZE * 2,
        label: "two full batches, the second fully short-circuited",
      },
      {
        n: BATCH_CONFIG.BATCH_SIZE * 2 + 1,
        label: "two full batches plus a short-circuited trailing run",
      },
    ])(
      "should fail all $n runs with the breaker tripping exactly once ($label)",
      async ({ n }) => {
        // Boundary: BATCH_SIZE=20, FAILURE_THRESHOLD=5. All calls already
        // dispatched in a batch (via Promise.allSettled) complete even after
        // the breaker trips mid-batch; only a SUBSEQUENT batch gets
        // short-circuited. The breaker only trips once, on its first
        // CLOSED->OPEN transition; deleteRuns stops issuing new batches once
        // it observes OPEN, so it never gets a chance to re-trip.
        const deps = makeTestDeps();
        deps.mockDeleteWorkflowRun.mockRejectedValue(
          makeHttpError("bad request", { status: 400 })
        );
        const api = makeApi(deps)(BASE_PARAMS);
        const runIds = Array.from({ length: n }, (_, i) => i + 1);
        const result = await api.deleteRuns(runIds);

        expect(result.succeeded).toBe(0);
        expect(result.failed).toBe(n);
        expect(api.getMetrics().circuitBreakerTrips).toBe(1);
      }
    );

    it("should complete without a stack overflow across 5000 runs (250 batches)", async () => {
      // deleteRuns processes batches via recursion (processBatches), not a
      // for-loop; each step is only reached after its predecessor's
      // Promise.allSettled/paceBatch await resolves, so this proves the
      // recursion doesn't grow the call stack proportionally to batch count.
      const deps = makeTestDeps();
      const api = makeApi(deps)(BASE_PARAMS);
      const runIds = Array.from({ length: 5000 }, (_, i) => i + 1);
      const result = await api.deleteRuns(runIds);

      expect(result.succeeded).toBe(5000);
      expect(result.failed).toBe(0);
      expect(deps.mockDeleteWorkflowRun).toHaveBeenCalledTimes(5000);
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

    it.each([
      { count: 100, label: "a single full page" },
      { count: 101, label: "a full page plus 1" },
      { count: 199, label: "a full page plus a near-full page" },
      { count: 200, label: "two full pages" },
    ])(
      "should accumulate exactly $count runs across $label",
      async ({ count }) => {
        // Pins getWorkflowRuns' for-await accumulation (api.ts:119-140)
        // across realistic per_page: 100 page boundaries, no off-by-one
        // dropped or double-counted across a yield boundary.
        const deps = makeTestDeps();
        const runs = makeWorkflowRuns({ count });
        const pages = chunkRuns(runs, 100);
        deps.mockPaginateIterator.mockImplementation(async function* () {
          for (const page of pages) {
            yield { data: page };
          }
        });
        const result = await makeApi(deps)(BASE_PARAMS).getRunsToDelete(
          undefined,
          0
        );
        expect(result.totalRuns).toBe(count);
        // keepCount is 0, so every generated run must appear exactly once.
        // A length-only check on totalRuns would still pass if a page
        // boundary bug dropped one run and double-counted another instead;
        // asserting the id set is duplicate-free is what actually catches
        // that.
        expect(result.runIds).toHaveLength(count);
        expect(new Set(result.runIds).size).toBe(count);
      }
    );

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

    it("should treat a run with a null name (deleted/renamed workflow file) as an empty-string name", async () => {
      // GitHub returns `name: null` for runs whose workflow file no longer
      // exists (deleted or renamed). toWorkflowRun's `run.name || ""`
      // fallback (src/lib/api.ts:84) must normalize that to "" rather than
      // propagate null, since workflowNames.includes(null) would throw off
      // the string-array filter type and never match any configured filter.
      const deps = makeTestDeps();
      const runsWithNullName = [
        {
          id: 1,
          workflow_id: 100,
          created_at: "2024-01-05T00:00:00Z",
          name: null,
        },
        {
          id: 2,
          workflow_id: 200,
          created_at: "2024-01-04T00:00:00Z",
          name: "CI",
        },
      ];
      deps.mockPaginateIterator.mockImplementation(async function* () {
        yield { data: runsWithNullName };
      });

      // No filter: both runs (including the null-named one) are candidates.
      const unfiltered = await makeApi(deps)(BASE_PARAMS).getRunsToDelete(
        undefined,
        0
      );
      expect(unfiltered.runIds).toEqual([1, 2]);

      // Filtered by name: the null-named run normalizes to "" and never
      // matches a configured filter, so only the named run survives.
      const filtered = await makeApi(deps)({
        ...BASE_PARAMS,
        workflowNames: ["CI"],
      }).getRunsToDelete(undefined, 0);
      expect(filtered.runIds).toEqual([2]);
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

    it("should recover via the injected now once TIMEOUT_MS elapses, not the wall clock", async () => {
      // Integration proof that makeApi wires its injected `now` into the
      // real circuit-breaker call site: a frozen wall-clock check would
      // never observe CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS elapsing during a
      // synchronous test run, so this only passes if canExecute() actually
      // consults the advanced mock `now` instead of Date.now().
      const deps = makeTestDeps();
      let currentTime = Date.now();
      deps.now.mockImplementation(() => currentTime);
      const error = Object.assign(new Error("Bad Request"), { status: 400 });
      deps.mockDeleteWorkflowRun.mockRejectedValue(error);
      const api = makeApi(deps)(BASE_PARAMS);

      // Trip the circuit breaker via 5 failed deleteRunById calls
      // (FAILURE_THRESHOLD is 5).
      const tripResult = await api.deleteRuns([1, 2, 3, 4, 5]);
      expect(tripResult.failed).toBe(5);
      expect(api.getMetrics().circuitBreakerTrips).toBe(1);

      // Advance the mock now past the recovery timeout.
      currentTime += CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS + 1;

      deps.mockDeleteWorkflowRun.mockResolvedValueOnce({});
      const recoveryResult = await api.deleteRuns([6]);
      expect(recoveryResult.succeeded).toBe(1);
      expect(deps.mockDeleteWorkflowRun).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        run_id: 6,
      });
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
