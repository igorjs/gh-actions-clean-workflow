/**
 * Main entry point for the GitHub Action
 */

import { setFailed, setOutput } from "@actions/core";
import type { ApiMetrics } from "./config/types";
import { getApi } from "./lib/api";
import * as logger from "./lib/logger";
import {
  getDryRun,
  getOwner,
  getRepo,
  getRunsOlderThan,
  getRunsToKeep,
  getToken,
  getWorkflowNames,
} from "./lib/params";

/**
 * Export metrics as GitHub Action outputs
 */
function exportMetrics(
  totalRuns: number,
  succeeded: number,
  failed: number,
  metrics: ApiMetrics
): void {
  setOutput("total-runs-found", totalRuns.toString());
  setOutput("runs-deleted", succeeded.toString());
  setOutput("runs-failed", failed.toString());
  setOutput("total-api-requests", metrics.totalRequests.toString());
  setOutput("successful-requests", metrics.successfulRequests.toString());
  setOutput("failed-requests", metrics.failedRequests.toString());
  setOutput("retry-attempts", metrics.retries.toString());
  setOutput("rate-limit-hits", metrics.rateLimitHits.toString());
  setOutput("circuit-breaker-trips", metrics.circuitBreakerTrips.toString());
}

/**
 * Log workflow statistics
 */
function logWorkflowStats(
  workflowStats: Map<number, { total: number; toDelete: number }>,
  runsToKeep: number,
  dryRun: boolean
): void {
  if (runsToKeep > 0 && workflowStats.size > 0) {
    for (const [workflowId, stats] of workflowStats) {
      if (stats.toDelete > 0) {
        const action = dryRun ? "would delete" : "deleting";
        logger.info(
          `Workflow ${workflowId}: keeping ${
            stats.total - stats.toDelete
          } runs, ${action} ${stats.toDelete} runs`
        );
      }
    }
  }
}

/**
 * Main execution function
 */
export async function run(): Promise<void> {
  try {
    const token = getToken();
    const owner = getOwner();
    const repo = getRepo();
    const runsToKeep = getRunsToKeep();
    const olderThanDays = getRunsOlderThan();
    const dryRun = getDryRun();
    const workflowNames = getWorkflowNames();

    if (dryRun) {
      logger.info("DRY RUN MODE - No runs will be actually deleted");
    }

    if (workflowNames.length > 0) {
      logger.info(`Filtering by workflows: ${workflowNames.join(", ")}`);
    }

    const api = getApi({ token, owner, repo, dryRun, workflowNames });

    logger.info(`Fetching workflow runs for ${owner}/${repo}...`);
    const { runIds, totalRuns, workflowStats } = await api.getRunsToDelete(
      olderThanDays,
      runsToKeep
    );

    logger.info(`Found ${totalRuns} runs older than ${olderThanDays} days`);

    if (runIds.length === 0) {
      logger.info("No runs to delete");
      const metrics = api.getMetrics();
      logger.metrics(metrics);
      exportMetrics(totalRuns, 0, 0, metrics);
      return;
    }

    // Log per-workflow statistics
    logWorkflowStats(workflowStats, runsToKeep, dryRun);

    const action = dryRun ? "Would delete" : "Deleting";
    logger.info(
      `${action} ${runIds.length} total runs across all workflows...`
    );

    // Delete runs
    const { failed, succeeded } = await api.deleteRuns(runIds);

    // Log final results
    if (dryRun) {
      logger.dryRun(`Would have deleted ${succeeded} runs`);
    } else {
      logger.success(`Deleted ${succeeded} runs`);
    }

    if (failed > 0) {
      logger.warn(`Failed to delete ${failed} runs`);
    }

    // Log and export metrics
    const metrics = api.getMetrics();
    logger.metrics(metrics);
    exportMetrics(totalRuns, succeeded, failed, metrics);

    // If there were failures, set action as failed
    if (failed > 0 && !dryRun) {
      setFailed(
        `Failed to delete ${failed} out of ${runIds.length} runs. Check logs for details.`
      );
    }
  } catch (err) {
    console.error(err);
    setFailed(err.message);
  }
}

// Only run if this is the main module (not being imported for testing)
if (require.main === module) {
  run();
}
