import { setFailed } from "@actions/core";
import { dateDiff, calculateTimeUnits } from "./utils/date";
import {
  getToken,
  getOwner,
  getRepo,
  getRunsToKeep,
  getDaysOld,
} from "./helpers/params";
import { getApi } from "./helpers/api";

async function run() {
  try {
    const token = getToken();
    const owner = getOwner();
    const repo = getRepo();
    const numRunsToKeep = getRunsToKeep();
    const numDaysOldToBeDeleted = getDaysOld();

    const api = getApi({ token, owner, repo });

    const hasRunBeforeDate = (run) => {
      const diff = dateDiff(run.updated_at, Date.now());
      return calculateTimeUnits(diff).days >= numDaysOldToBeDeleted;
    };

    const workflowRuns = await api.listWorkflowRuns();

    const workflowRunsToDelete = workflowRuns
      .filter(hasRunBeforeDate)
      .slice(numRunsToKeep);

    console.info("%d workflow runs to be deleted", workflowRunsToDelete.length);

    if (workflowRunsToDelete.length > 0) {
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
