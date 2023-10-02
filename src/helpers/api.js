import { getOctokit } from "@actions/github";

const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getApi = ({ token, owner, repo }) => {
  /**
   * https://octokit.github.io/rest.js/v18
   **/
  const octokit = new getOctokit(token);

  const deleteRunById = async (id) => {
    console.info("Deleting workflow run #%d", id);

    await sleep(1000);

    return await octokit.rest.actions
      .deleteWorkflowRun({ owner, repo, run_id: id })
      .catch((err) => {
        console.error("Failed to delete workflow run #%d", id, err.message);
        return false;
      });
  };

  const deleteRuns = async (runs) => {
    const resolved = await Promise.all(
      runs.map((run) => deleteRunById(run.id))
    );
    return resolved.filter(Boolean);
  };

  const listWorkflowRuns = async (status = "completed") => {
    const workflowRuns = [];

    for await (const results of octokit.paginate.iterator(
      octokit.rest.actions.listWorkflowRunsForRepo,
      { owner, repo, status, per_page: 100 }
    )) {
      await sleep(1000);
      workflowRuns.push(...results.data);
    }

    return workflowRuns;
  };

  return {
    deleteRuns,
    deleteRunById,
    listWorkflowRuns,
  };
};
