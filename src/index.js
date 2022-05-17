import { getInput, info, setFailed, setOutput } from "@actions/core";
import { getOctokit } from "@actions/github";
import { dateDiff, calcTimeUnits } from "./dateutils.js";

async function run() {
  try {
    const token = getInput("token", { required: true, trimWhitespace: true });
    const owner = getInput("owner", { required: true, trimWhitespace: true });
    const repo = getInput("repo", { required: true, trimWhitespace: true });
    const days_old = getInput("days_old", {
      required: false,
      trimWhitespace: true,
    });

    const numDaysOldToBeDeleted = Number(days_old || 7);

    /**
     * https://octokit.github.io/rest.js/v18
     **/
    const octokit = new getOctokit(token);

    /**
     * We need to fetch the list of workflow runs for a particular repo.
     * We use octokit.paginate() to automatically loop over all the pages of the results.
     */
    // const workflows = await octokit.paginate(
    //   "GET /repos/:owner/:repo/actions/workflows",
    //   defaults
    // );
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

    info(`${workflowRunsToDelete.length} workflow runs to be deleted`);

    if (workflowRunsToDelete.length > 0) {
      /**
       * Loop over all the WorkflowRuns and delete them.
       **/
      const deleteRunAction = ({ id }) => {
        info(`Deleting workflow run #${id}`);

        return octokit.rest.actions
          .deleteWorkflowRun({ owner, repo, run_id: id })
          .catch((err) => `An error occurrend: ${err.message}`);
      };

      const requests = await Promise.all(
        workflowRunsToDelete.map(deleteRunAction)
      );

      info(`${requests.length} workflow runs sucessfully deleted`);

      setOutput(
        "result",
        `${requests.length} workflow runs sucessfully deleted`
      );
    }
  } catch (error) {
    setFailed(error.message);
  }
}

run();
