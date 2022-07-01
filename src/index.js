import { setFailed } from "@actions/core";
import { getApiActions } from "./api.js";
import { dateDiff, calcTimeUnits } from "./utils/date.js";
import { getToken, getOwner, getRepo, getDaysOld } from "./helpers/params";

async function run() {
  try {
    const repo = getRepo("repo");
    const owner = getOwner("owner");
    const token = getToken("token");
    const numDaysOldToBeDeleted = getDaysOld("days_old");

    const actions = getApiActions({ token, owner, repo });

    const { data } = await actions.listWorkflowRunsForRepo();

    const hasRunBeforeDate = (run) => {
      const diff = dateDiff(run.updated_at, Date.now());
      return calcTimeUnits(diff).days >= numDaysOldToBeDeleted;
    };

    const workflowRunsToDelete = data.workflow_runs.filter(hasRunBeforeDate);

    console.info(`${workflowRunsToDelete.length} workflow runs to be deleted`);

    if (workflowRunsToDelete.length > 0) {
      const results = await Promise.all(
        workflowRunsToDelete.map(actions.deleteRunAction)
      );

      if (results.length > 0) {
        console.info(`${results.length} workflow runs sucessfully deleted`);
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
