// SPDX-License-Identifier: MIT
import { API_CONFIG, CircuitState } from "#src/config/constants";
import type {
  Api,
  ApiDeps,
  ApiMetrics,
  ApiParams,
  DeletionResult,
  RunsToDeleteResult,
  WorkflowRun,
} from "#src/config/types";
import { computeRunsToDelete } from "#src/core/api";
import { createCircuitBreaker } from "./circuit-breaker";
import * as logger from "./logger";
import { makeRetry } from "./retry";

export function makeApi(deps: ApiDeps): (params: ApiParams) => Api {
  const { getOctokit, sleep, now } = deps;

  return (params: ApiParams): Api => {
    const { token, owner, repo, dryRun = false, workflowNames = [] } = params;
    const octokit = getOctokit(token);
    const circuitBreaker = createCircuitBreaker({ now });
    const withRetry = makeRetry({ sleep });

    const metrics: ApiMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
    };

    async function deleteRunById(id: number): Promise<void> {
      if (!circuitBreaker.canExecute()) {
        throw new Error(
          `Circuit breaker is ${circuitBreaker.getState()} - skipping deletion of run #${id}`
        );
      }

      if (dryRun) {
        logger.dryRun(`Would delete run #${id}`);
        // Deliberate delay, not an oversight: no API call happens here, but
        // keeping the pacing gives users previewing a dry run a realistic
        // sense of how long the real deletion run will take.
        await sleep(100);
        return;
      }

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
    }

    async function deleteRuns(runs: number[]): Promise<DeletionResult> {
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < runs.length; i += API_CONFIG.BATCH_SIZE) {
        const batch = runs.slice(i, i + API_CONFIG.BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((id) => deleteRunById(id))
        );

        const batchSucceeded = results.filter(
          (result) => result.status === "fulfilled"
        ).length;
        succeeded += batchSucceeded;
        failed += results.length - batchSucceeded;

        if (circuitBreaker.getState() === CircuitState.OPEN) {
          logger.warn("Circuit breaker OPEN - stopping further deletions");
          failed += runs.length - (i + batch.length);
          break;
        }

        // Pace between batches rather than inside each concurrent task: a
        // per-task delay in deleteRunById overlapped across the whole batch
        // and had no effect on real throughput. Skipped for dry runs (no
        // API calls made) and after the final batch (nothing left to pace).
        const hasMoreBatches = i + batch.length < runs.length;
        if (!dryRun && hasMoreBatches) {
          await sleep(API_CONFIG.RATE_LIMIT_DELAY_MS * batch.length);
        }
      }

      return { failed, succeeded };
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
          per_page: 100,
          ...(created && { created }),
        }
      )) {
        for (const run of response.data) {
          const workflowName = run.name || "";
          if (workflowNames.length > 0 && !workflowNames.includes(workflowName))
            continue;
          runs.push({
            id: run.id,
            workflow_id: run.workflow_id,
            created_at: run.created_at,
            name: workflowName,
          });
        }
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
