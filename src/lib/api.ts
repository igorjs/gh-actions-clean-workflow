// SPDX-License-Identifier: MIT

import type { getOctokit } from "@actions/github";
import {
  computeRunsToDelete,
  type RunsToDeleteResult,
  type WorkflowRun,
} from "#src/core/api";
import { CircuitState } from "#src/core/circuit-breaker";
import type { RetryMetrics } from "#src/core/retry";
import type { ApiMetrics, Sleep } from "#src/types";
import { createCircuitBreaker } from "./circuit-breaker";
import { createDeletionMode } from "./deletion-mode";
import * as logger from "./logger";
import { makeRetry } from "./retry";

export type OctokitInstance = ReturnType<typeof getOctokit>;

export interface ApiParams {
  token: string;
  owner: string;
  repo: string;
  /** No actual deletions when true */
  dryRun?: boolean;
  /** Only delete runs from these workflows, if provided */
  workflowNames?: string[];
}

export interface DeletionResult {
  succeeded: number;
  failed: number;
}

export type ApiDeps = {
  getOctokit: (token: string) => OctokitInstance;
  sleep: Sleep;
  now: () => number;
};

export interface Api {
  deleteRuns(runs: number[]): Promise<DeletionResult>;
  getRunsToDelete(
    olderThanDays?: number,
    runsToKeep?: number
  ): Promise<RunsToDeleteResult>;
  getMetrics(): ApiMetrics;
}

export const BATCH_CONFIG = {
  /** Maximum number of concurrent delete requests to respect GitHub's 100 concurrent limit */
  BATCH_SIZE: 20,
  /**
   * Per-run rate limiting delay in ms, applied once per batch (delay *
   * batch size) between batches of BATCH_SIZE concurrent deletions, not
   * per individual delete. With the defaults below (20 * 350ms = 7s
   * between batches of 20) this paces out to ~170 deletions/min with a
   * safety margin under GitHub's secondary rate limits.
   */
  RATE_LIMIT_DELAY_MS: 350,
  /** GitHub's maximum page size for listWorkflowRunsForRepo */
  PAGE_SIZE: 100,
} as const;

// Closes over nothing, so it's declared once at module scope instead of as
// an inline arrow rebuilt on every deleteRuns call.
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

// Closes over nothing, so it's declared once at module scope instead of as
// an inline arrow rebuilt on every getWorkflowRuns call.
function toWorkflowRun(run: {
  id: number;
  workflow_id: number;
  created_at: string;
  name?: string | null;
}): WorkflowRun {
  return {
    id: run.id,
    workflow_id: run.workflow_id,
    created_at: run.created_at,
    name: run.name || "",
  };
}

export function makeApi(deps: ApiDeps): (params: ApiParams) => Api {
  const { getOctokit, sleep, now } = deps;

  return (params: ApiParams): Api => {
    const { token, owner, repo, dryRun = false, workflowNames = [] } = params;
    const octokit = getOctokit(token);
    const circuitBreaker = createCircuitBreaker({ now });
    const withRetry = makeRetry({ sleep });
    const mode = createDeletionMode(dryRun, sleep);

    const metrics: RetryMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      rateLimitHits: 0,
    };

    async function deleteRunById(id: number): Promise<void> {
      if (!circuitBreaker.canExecute()) {
        throw new Error(
          `Circuit breaker is ${circuitBreaker.getState()} - skipping deletion of run #${id}`
        );
      }

      await mode.execute(id, async () => {
        try {
          logger.info(`Deleting run #${id}`);
          await withRetry(
            () =>
              octokit.rest.actions.deleteWorkflowRun({
                owner,
                repo,
                run_id: id,
              }),
            `delete run #${id}`,
            metrics,
            circuitBreaker
          );
          logger.success(`Run #${id} was deleted`);
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          logger.error(`Failed to delete run #${id}: ${errorMessage}`);
          throw err;
        }
      });
    }

    // Recursive instead of a for-loop: each step threads succeeded/failed
    // forward as arguments rather than mutating outer `let`s, and the
    // circuit-breaker-open case is a direct early return instead of a
    // break plus a follow-up index calculation.
    async function processBatches(
      batches: number[][],
      index: number,
      succeeded: number,
      failed: number
    ): Promise<DeletionResult> {
      if (index >= batches.length) {
        return { succeeded, failed };
      }

      const batch = batches[index];
      const results = await Promise.allSettled(
        batch.map((id) => deleteRunById(id))
      );

      const batchSucceeded = results.filter(
        (result) => result.status === "fulfilled"
      ).length;
      const newSucceeded = succeeded + batchSucceeded;
      const newFailed = failed + (results.length - batchSucceeded);

      if (circuitBreaker.getState() === CircuitState.OPEN) {
        logger.warn("Circuit breaker OPEN - stopping further deletions");
        const remainingRuns = batches.slice(index + 1).flat().length;
        return { succeeded: newSucceeded, failed: newFailed + remainingRuns };
      }

      // Pace between batches rather than inside each concurrent task: a
      // per-task delay in deleteRunById overlapped across the whole batch
      // and had no effect on real throughput. mode.paceBatch is a no-op
      // for dry runs (no API calls made) and skipped after the final
      // batch (nothing left to pace).
      const hasMoreBatches = index + 1 < batches.length;
      if (hasMoreBatches) {
        await mode.paceBatch(BATCH_CONFIG.RATE_LIMIT_DELAY_MS * batch.length);
      }

      return processBatches(batches, index + 1, newSucceeded, newFailed);
    }

    async function deleteRuns(runs: number[]): Promise<DeletionResult> {
      return processBatches(chunk(runs, BATCH_CONFIG.BATCH_SIZE), 0, 0, 0);
    }

    async function getWorkflowRuns(
      olderThanDays?: number
    ): Promise<WorkflowRun[]> {
      const runs: WorkflowRun[] = [];
      let created: string | undefined;

      if (olderThanDays !== undefined && olderThanDays > 0) {
        const cutoffDate = new Date(now());
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        created = `<${cutoffDate.toISOString().split("T")[0]}`;
      }

      for await (const response of octokit.paginate.iterator(
        octokit.rest.actions.listWorkflowRunsForRepo,
        {
          owner,
          repo,
          status: "completed",
          per_page: BATCH_CONFIG.PAGE_SIZE,
          ...(created && { created }),
        }
      )) {
        runs.push(
          ...response.data
            .filter(
              (run) =>
                workflowNames.length === 0 ||
                workflowNames.includes(run.name || "")
            )
            .map(toWorkflowRun)
        );
      }

      return runs;
    }

    async function getRunsToDelete(
      olderThanDays?: number,
      runsToKeep?: number
    ): Promise<RunsToDeleteResult> {
      const runs = await getWorkflowRuns(olderThanDays);
      return computeRunsToDelete(runs, runsToKeep);
    }

    function getMetrics(): ApiMetrics {
      return { ...metrics, circuitBreakerTrips: circuitBreaker.getTripCount() };
    }

    return { deleteRuns, getRunsToDelete, getMetrics };
  };
}
