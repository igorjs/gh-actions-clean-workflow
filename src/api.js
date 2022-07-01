import { getOctokit } from "@actions/github";

export const getApiActions = ({ token, owner, repo }) => {
  /**
   * https://octokit.github.io/rest.js/v18
   **/
  const octokit = new getOctokit(token);

  return {
    deleteRunAction: async ({ id }) => {
      console.info(`Deleting workflow run #${id}`);

      return octokit.rest.actions
        .deleteWorkflowRun({ owner, repo, run_id: id })
        .catch((err) => `An error occurrend: ${err.message}`);
    },
    // getWorkflows: async () => {
    //   return await octokit.paginate(
    //     "GET /repos/:owner/:repo/actions/workflows",
    //     { owner, repo }
    //   );
    // },
    listWorkflowRunsForRepo: async ({ page = 1, status = "completed" }) => {
      return octokit.rest.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        status,
        page,
        per_page: 100,
      });
    },
  };
};
