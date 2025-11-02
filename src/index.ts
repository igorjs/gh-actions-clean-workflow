/**
 * Main entry point for the GitHub Action
 */

import { setFailed, setOutput } from "@actions/core";
import { getApi } from "./lib/api";
import { Logger } from "./lib/logger";
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
      Logger.info("DRY RUN MODE - No runs will be actually deleted");
    }

    if (workflowNames.length > 0) {
      Logger.info(`Filtering by workflows: ${workflowNames.join(", ")}`);
    }

    const api = getApi({ token, owner, repo, dryRun, workflowNames });

    Logger.info(`Fetching workflow runs for ${owner}/${repo}...`);
    const { runIds, totalRuns, workflowStats } = await api.getRunsToDelete(
      olderThanDays,
      runsToKeep
    );

    Logger.info(`Found ${totalRuns} runs older than ${olderThanDays} days`);

    if (runIds.length === 0) {
      Logger.info("No runs to delete");
      const metrics = api.getMetrics();
      Logger.metrics(metrics);

      // Export metrics even when no runs to delete
      setOutput("total-runs-found", totalRuns.toString());
      setOutput("runs-deleted", "0");
      setOutput("runs-failed", "0");
      setOutput("total-api-requests", metrics.totalRequests.toString());
      setOutput("successful-requests", metrics.successfulRequests.toString());
      setOutput("failed-requests", metrics.failedRequests.toString());
      setOutput("retry-attempts", metrics.retries.toString());
      setOutput("rate-limit-hits", metrics.rateLimitHits.toString());
      setOutput(
        "circuit-breaker-trips",
        metrics.circuitBreakerTrips.toString()
      );
      return;
    }

    // Log per-workflow statistics
    if (runsToKeep > 0 && workflowStats.size > 0) {
      for (const [workflowId, stats] of workflowStats) {
        if (stats.toDelete > 0) {
          const action = dryRun ? "would delete" : "deleting";
          Logger.info(
            `Workflow ${workflowId}: keeping ${
              stats.total - stats.toDelete
            } runs, ${action} ${stats.toDelete} runs`
          );
        }
      }
    }

    const action = dryRun ? "Would delete" : "Deleting";
    Logger.info(
      `${action} ${runIds.length} total runs across all workflows...`
    );

    // Delete runs
    const { failed, succeeded } = await api.deleteRuns(runIds);

    // Log final results
    if (dryRun) {
      Logger.dryRun(`Would have deleted ${succeeded} runs`);
    } else {
      Logger.success(`Deleted ${succeeded} runs`);
    }

    if (failed > 0) {
      Logger.warn(`Failed to delete ${failed} runs`);
    }

    // Log metrics
    const metrics = api.getMetrics();
    Logger.metrics(metrics);

    // Export metrics as action outputs for use in subsequent steps
    setOutput("total-runs-found", totalRuns.toString());
    setOutput("runs-deleted", succeeded.toString());
    setOutput("runs-failed", failed.toString());
    setOutput("total-api-requests", metrics.totalRequests.toString());
    setOutput("successful-requests", metrics.successfulRequests.toString());
    setOutput("failed-requests", metrics.failedRequests.toString());
    setOutput("retry-attempts", metrics.retries.toString());
    setOutput("rate-limit-hits", metrics.rateLimitHits.toString());
    setOutput("circuit-breaker-trips", metrics.circuitBreakerTrips.toString());

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
