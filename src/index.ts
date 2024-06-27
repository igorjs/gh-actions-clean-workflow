import { setFailed } from "@actions/core";
import { getApi, type WorkflowRunData } from "./helpers/api";
import {
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
    const runsToKeep = getRunsToKeep().unwrapOrElse(0);
    const olderThanDays = getRunsOlderThan().unwrapOrElse(7);

    const api = getApi({ token, owner, repo });

    const workflowRuns = await api.getWorkflowRuns();

    const filterOlderThan = (run: WorkflowRunData) => {
      const diff = dateDiff(run.run_started_at);
      const days = calculateTimeUnits(diff).days;
      return days >= olderThanDays;
    };

    for (const { workflow, runs } of workflowRuns) {
      const runsToDelete = runs.slice(runsToKeep).filter(filterOlderThan);

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
