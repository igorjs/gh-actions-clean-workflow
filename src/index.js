import { setFailed } from "@actions/core";
import { getOctokit } from "@actions/github";
import { dateDiff, calcTimeUnits } from "./utils/date.js";
import { getToken, getOwner, getRepo, getDaysOld } from "./helpers/params";

async function run() {
  try {
    const repo = getRepo("repo");
    const owner = getOwner("owner");
    const token = getToken("token");
    const numDaysOldToBeDeleted = getDaysOld("days_old");

    /**
     * https://octokit.github.io/rest.js/v18
     **/
    const octokit = new getOctokit(token);

    /**
     * We need to fetch the list of workflow runs for a particular repo.
     * We use octokit.paginate() to automatically loop over all the pages of the results.
     */
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      status: "completed",
      per_page: 100,
    });

    const hasRunBeforeDate = (run) => {
      const diff = dateDiff(run.updated_at, Date.now());
      return calcTimeUnits(diff).days >= numDaysOldToBeDeleted;
    };

    const workflowRunsToDelete = data.workflow_runs.filter(hasRunBeforeDate);

    console.info(`${workflowRunsToDelete.length} workflow runs to be deleted`);

    if (workflowRunsToDelete.length > 0) {
      /**
       * Loop over all the WorkflowRuns and delete them.
       **/
      const deleteRunAction = ({ id }) => {
        console.info(`Deleting workflow run #${id}`);

        return octokit.rest.actions
          .deleteWorkflowRun({ owner, repo, run_id: id })
          .catch((err) => `An error occurrend: ${err.message}`);
      };

      const results = await Promise.all(
        workflowRunsToDelete.map(deleteRunAction)
      );

      if (results.length > 0) {
        console.info(`${results.length} workflow runs sucessfully deleted`);
      } else {
        throw new Error(
          `The action could not delete any workflows. Please review your parameters.`
        );
      }
    }
  } catch (error) {
    setFailed(error.message);
  }
}

run();
