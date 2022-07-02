import { getOctokit } from "@actions/github";

export const getApi = ({ token, owner, repo }) => {
  /**
   * https://octokit.github.io/rest.js/v18
   **/
  const octokit = new getOctokit(token);

  const deleteRunById = async (id) => {
    console.info("Deleting workflow run #%d", id);

    return octokit.rest.actions
      .deleteWorkflowRun({ owner, repo, run_id: id })
      .catch(() => false);
  };

  const deleteRuns = async (runs) => {
    return await Promise.all(
      runs.map((run) => deleteRunById(run.id)).filter(Boolean)
    );
  };

  const listWorkflowRuns = async (status = "completed") => {
    const workflowRuns = [];

    for await (const results of octokit.paginate.iterator(
      octokit.rest.actions.listWorkflowRunsForRepo,
      { owner, repo, status, per_page: 100 }
    )) {
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
