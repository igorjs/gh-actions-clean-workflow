import { setFailed } from "@actions/core";
import { getApi } from "./helpers/api";
import {
  getDaysOld,
  getOwner,
  getRepo,
  getRunsOlderThan,
  getRunsToKeep,
  getToken,
} from "./helpers/params";
import { calculateTimeUnits, dateDiff } from "./utils/date";

async function run() {
  try {
    const token = getToken().unwrap();
    const owner = getOwner().unwrap();
    const repo = getRepo().unwrap();
    const keep = getRunsToKeep().default(0).unwrap();
    const olderThanDays = getRunsOlderThan().default(7).unwrap();

    const api = getApi({ token, owner, repo });

    const workflowRuns = await api.getWorkflowRuns();

    for (const { workflow, runs } of workflowRuns) {
      const runsToDelete = runs
        .filter((run) => {
          const diff = dateDiff(run.run_started_at);
          const days = calculateTimeUnits(diff).days;
          return days >= olderThanDays;
        })
        .slice(keep);

      if (runsToDelete.length > 0) {
        console.log(
          "Deleting %d runs for workflow: %s",
          runsToDelete.length,
          workflow.name
        );

        const { succeeded, failed } = await api.deleteRuns(runsToDelete);

        if (succeeded > 0) {
          console.info("%d workflow runs sucessfully deleted", succeeded);
        }

        if (failed > 0) {
          console.error("%d workflow runs couldn't be deleted", failed);
        }
      }
    }
  } catch (err) {
    console.error(err);
    setFailed(err.message);
  }
}

run();
