/**
 * GitHub Actions API client with retry logic, circuit breaker, and rate limiting
 */

import { setTimeout } from "node:timers/promises";
import { getOctokit } from "@actions/github";
import { API_CONFIG, CircuitState } from "../config/constants";
import type {
  Api,
  ApiMetrics,
  ApiParams,
  DeletionResult,
  RunsToDeleteResult,
  WorkflowRun,
} from "../config/types";
import { CircuitBreaker } from "./circuit-breaker";
import * as logger from "./logger";
import { withRetry } from "./retry";

/**
 * Creates and returns an API client instance
 * @param params - Configuration parameters for the API client
 * @returns API client instance
 */
export function getApi(params: ApiParams): Api {
  const { token, owner, repo, dryRun = false, workflowNames = [] } = params;
  const octokit = getOctokit(token);
  const circuitBreaker = new CircuitBreaker();

  const metrics: ApiMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retries: 0,
    rateLimitHits: 0,
    circuitBreakerTrips: 0,
  };

  /**
   * Deletes a single workflow run by ID
   */
  async function deleteRunById(id: number): Promise<void> {
    if (!circuitBreaker.canExecute()) {
      metrics.circuitBreakerTrips++;
      throw new Error(
        `Circuit breaker is ${circuitBreaker.getState()} - skipping deletion of run #${id}`
      );
    }

    if (dryRun) {
      logger.dryRun(`Would delete run #${id}`);
      await setTimeout(100); // Simulate API call
      return;
    }

    try {
      logger.info(`Deleting run #${id}`);
      await withRetry(
        () =>
          octokit.rest.actions.deleteWorkflowRun({ owner, repo, run_id: id }),
        `delete run #${id}`,
        metrics,
        circuitBreaker
      );
      logger.success(`Run #${id} was deleted`);
    } catch (err) {
      const errorMessage = err.message || "Unknown error";
      logger.error(`Failed to delete run #${id}: ${errorMessage}`);
      throw err;
    } finally {
      await setTimeout(API_CONFIG.RATE_LIMIT_DELAY_MS);
    }
  }

  /**
   * Deletes multiple workflow runs in batches
   */
  async function deleteRuns(runs: number[]): Promise<DeletionResult> {
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < runs.length; i += API_CONFIG.BATCH_SIZE) {
      const batch = runs.slice(i, i + API_CONFIG.BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((id) => deleteRunById(id))
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          succeeded++;
        } else {
          failed++;
        }
      }

      if (circuitBreaker.getState() === CircuitState.OPEN) {
        logger.warn("Circuit breaker OPEN - stopping further deletions");
        failed += runs.length - (i + batch.length);
        break;
      }
    }

    return { failed, succeeded };
  }

  /**
   * Fetches workflow runs matching the filter criteria
   */
  async function getWorkflowRuns(
    olderThanDays?: number
  ): Promise<WorkflowRun[]> {
    const runs: WorkflowRun[] = [];
    let created: string | undefined;

    if (olderThanDays !== undefined && olderThanDays > 0) {
      const cutoffDate = new Date();
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

        // Filter by workflow names if specified
        if (workflowNames.length > 0 && !workflowNames.includes(workflowName)) {
          continue;
        }

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

  /**
   * Determines which runs should be deleted based on criteria
   */
  async function getRunsToDelete(
    olderThanDays?: number,
    runsToKeep?: number
  ): Promise<RunsToDeleteResult> {
    const runs = await getWorkflowRuns(olderThanDays);
    const totalRuns = runs.length;

    if (totalRuns === 0) {
      return {
        runIds: [],
        totalRuns: 0,
        workflowStats: new Map(),
      };
    }

    const runsByWorkflow = new Map<number, WorkflowRun[]>();
    for (const run of runs) {
      const workflowId = run.workflow_id;
      if (!runsByWorkflow.has(workflowId)) {
        runsByWorkflow.set(workflowId, []);
      }
      runsByWorkflow.get(workflowId)?.push(run);
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

      for (const run of runsToDelete) {
        runIds.push(run.id);
      }
    }

    return {
      runIds,
      totalRuns,
      workflowStats,
    };
  }

  /**
   * Returns current API metrics
   */
  function getMetrics(): ApiMetrics {
    return { ...metrics };
  }

  return {
    deleteRuns,
    getRunsToDelete,
    getMetrics,
  };
}
