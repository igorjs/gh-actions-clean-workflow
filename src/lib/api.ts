import { API_CONFIG, CircuitState } from "../config/constants";
import type {
  Api,
  ApiDeps,
  ApiMetrics,
  ApiParams,
  DeletionResult,
  RunsToDeleteResult,
  WorkflowRun,
} from "../config/types";
import { createCircuitBreaker } from "./circuit-breaker";
import * as logger from "./logger";
import { makeRetry } from "./retry";

export function makeApi(deps: ApiDeps): (params: ApiParams) => Api {
  const { getOctokit, sleep, now } = deps;

  return (params: ApiParams): Api => {
    const { token, owner, repo, dryRun = false, workflowNames = [] } = params;
    const octokit = getOctokit(token);
    const circuitBreaker = createCircuitBreaker();
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
        metrics.circuitBreakerTrips++;
        throw new Error(
          `Circuit breaker is ${circuitBreaker.getState()} - skipping deletion of run #${id}`
        );
      }

      if (dryRun) {
        logger.dryRun(`Would delete run #${id}`);
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
        const errorMessage = (err as Error).message || "Unknown error";
        logger.error(`Failed to delete run #${id}: ${errorMessage}`);
        throw err;
      } finally {
        await sleep(API_CONFIG.RATE_LIMIT_DELAY_MS);
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

        for (const result of results) {
          if (result.status === "fulfilled") succeeded++;
          else failed++;
        }

        if (circuitBreaker.getState() === CircuitState.OPEN) {
          logger.warn("Circuit breaker OPEN - stopping further deletions");
          failed += runs.length - (i + batch.length);
          break;
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
      const totalRuns = runs.length;

      if (totalRuns === 0) {
        return { runIds: [], totalRuns: 0, workflowStats: new Map() };
      }

      const runsByWorkflow = new Map<number, WorkflowRun[]>();
      for (const run of runs) {
        if (!runsByWorkflow.has(run.workflow_id))
          runsByWorkflow.set(run.workflow_id, []);
        runsByWorkflow.get(run.workflow_id)?.push(run);
      }

      const runIds: number[] = [];
      const workflowStats = new Map<
        number,
        { total: number; toDelete: number }
      >();
      const keepCount = Math.max(0, runsToKeep || 0);

      for (const [workflowId, workflowRuns] of runsByWorkflow) {
        workflowRuns.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const runsToDelete = workflowRuns.slice(keepCount);
        workflowStats.set(workflowId, {
          total: workflowRuns.length,
          toDelete: runsToDelete.length,
        });
        for (const run of runsToDelete) runIds.push(run.id);
      }

      return { runIds, totalRuns, workflowStats };
    }

    function getMetrics(): ApiMetrics {
      return { ...metrics };
    }

    return { deleteRuns, getRunsToDelete, getMetrics };
  };
}
