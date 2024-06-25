import { setFailed } from "@actions/core";
import { getApi } from "./helpers/api";
import {
  getDaysOld,
  getOwner,
  getRepo,
  getRunsToKeep,
  getToken,
} from "./helpers/params";
import { calculateTimeUnits, dateDiff } from "./utils/date";

async function run() {
  try {
    const token = getToken().unwrap();
    const owner = getOwner().unwrap();
    const repo = getRepo().unwrap();
    const runsToKeep = getRunsToKeep().unwrap();
    const daysOldToBeDeleted = getDaysOld().unwrap();

    const api = getApi({ token, owner, repo });

    const workflowRunsList = (await api.getWorkflowRuns()).unwrap();

    const workflowRunsToDelete = new Array();

    for (const [_, runs] of workflowRunsList) {
      workflowRunsToDelete.push(
        ...runs
          .filter((run) => {
            const diff = dateDiff(run.updated_at);
            const days = calculateTimeUnits(diff).days;
            return days >= daysOldToBeDeleted;
          })
          .slice(runsToKeep)
      );
    }

    if (workflowRunsToDelete.length > 0) {
      console.info(
        "%d workflow runs to be deleted",
        workflowRunsToDelete.length
      );

      const results = await api.deleteRuns(workflowRunsToDelete);

      if (results.length > 0) {
        console.info("%d workflow runs sucessfully deleted", results.length);
      } else {
        throw new Error(
          `The action could not delete any workflows. Please review your parameters.`
        );
      }
    }
  } catch (err) {
    console.error(err);
    setFailed(err.message);
  }
}

run();
