/**
 * Main entry point for the GitHub Action
 */

import { setFailed } from "@actions/core";
import { getApi } from "./lib/api";
import { Logger } from "./lib/logger";
import {
  getDryRun,
  getOwner,
  getRepo,
  getRunsOlderThan,
  getRunsToKeep,
  getToken,
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

    if (dryRun) {
      Logger.info("DRY RUN MODE - No runs will be actually deleted");
    }

    const api = getApi({ token, owner, repo, dryRun });

    Logger.info(`Fetching workflow runs for ${owner}/${repo}...`);
    const { runIds, totalRuns, workflowStats } = await api.getRunsToDelete(
      olderThanDays,
      runsToKeep
    );

    Logger.info(`Found ${totalRuns} runs older than ${olderThanDays} days`);

    if (runIds.length === 0) {
      Logger.info("No runs to delete");
      Logger.metrics(api.getMetrics());
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
    Logger.metrics(api.getMetrics());

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
