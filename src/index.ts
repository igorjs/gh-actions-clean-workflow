import { setFailed } from "@actions/core";
import { getApi } from "./helpers/api";
import {
  getOwner,
  getRepo,
  getRunsOlderThan,
  getRunsToKeep,
  getToken,
} from "./helpers/params";

(async function run() {
  try {
    const token = getToken().unwrap();
    const owner = getOwner().unwrap();
    const repo = getRepo().unwrap();
    const runsToKeep = getRunsToKeep().unwrapOrElse(0);
    const olderThanDays = getRunsOlderThan().unwrapOrElse(7);

    const api = getApi({ token, owner, repo });

    const { runIds, totalRuns, workflowStats } = await api.getRunsToDelete(
      olderThanDays,
      runsToKeep
    );

    console.info(
      `INFO: Found ${totalRuns} runs older than ${olderThanDays} days`
    );

    if (runIds.length === 0) {
      console.info("INFO: No runs to delete");
      return;
    }

    // Log per-workflow statistics
    if (runsToKeep > 0 && workflowStats.size > 0) {
      for (const [workflowId, stats] of workflowStats) {
        if (stats.toDelete > 0) {
          console.info(
            `INFO: Workflow ${workflowId}: keeping ${
              stats.total - stats.toDelete
            } runs, deleting ${stats.toDelete} runs`
          );
        }
      }
    }

    console.info(
      `INFO: Deleting ${runIds.length} total runs across all workflows...`
    );

    // Delete runs
    const { failed, succeeded } = await api.deleteRuns(runIds);

    console.info(`INFO: Successfully deleted ${succeeded} runs`);
    if (failed > 0) {
      console.warn(`WARN: Failed to delete ${failed} runs`);
    }
  } catch (err) {
    console.error(err);
    setFailed(err.message);
  }
})();
