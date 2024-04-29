import { setTimeout } from "node:timers/promises";
import { getOctokit } from "@actions/github";
import { Result, ok, error } from "../utils/result";

export function getApi({ token, owner, repo }) {
  /**
   * https://octokit.github.io/rest.js/v20
   **/
  const octokit = getOctokit(token);

  async function deleteRunById(id: number): Promise<Result<string>> {
    console.info("Deleting workflow run #%d", id);

    await setTimeout(1000); // rate limiting.

    return octokit.rest.actions
      .deleteWorkflowRun({ owner, repo, run_id: id })
      .then((_) => ok(`SUCCESS: Workflow run #${id} was deleted`))
      .catch((err) =>
        error(`ERROR: Failed to delete workflow run #${id}: ${err.message}`)
      );
  }

  async function deleteRuns(runs) {
    const resolved = await Promise.all(
      runs.map((run) => deleteRunById(run.id))
    );
    return resolved.filter(Boolean);
  }

  const listCompletedWorkflowRuns = async () => {
    const workflowRuns = [];

    for await (const results of octokit.paginate.iterator(
      octokit.rest.actions.listWorkflowRunsForRepo,
      {
        owner,
        repo,
        status: "completed",
        per_page: 100,
      }
    )) {
      await setTimeout(1000); // rate limiting.
      workflowRuns.push(...results.data);
    }

    return workflowRuns;
  };

  return {
    deleteRuns,
    deleteRunById,
    listWorkflowRuns: listCompletedWorkflowRuns,
  };
}
