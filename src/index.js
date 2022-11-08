import { setFailed } from "@actions/core";
import { dateDiff, calcTimeUnits } from "./utils/date.js";
import { getToken, getOwner, getRepo, getDaysOld } from "./helpers/params.js";
import { getApi } from "./helpers/api.js";

async function run() {
  try {
    const token = getToken("token");
    const owner = getOwner("owner");
    const repo = getRepo("repo");
    const numDaysOldToBeDeleted = getDaysOld("days_old");

    const api = getApi({ token, owner, repo });

    const hasRunBeforeDate = (run) => {
      const diff = dateDiff(run.updated_at, Date.now());
      return calcTimeUnits(diff).days >= numDaysOldToBeDeleted;
    };

    const workflowRuns = await api.listWorkflowRuns();

    const workflowRunsToDelete = workflowRuns.filter(hasRunBeforeDate);

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
