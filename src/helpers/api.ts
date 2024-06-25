import { setTimeout } from "node:timers/promises";
import { getOctokit } from "@actions/github";
import { Result } from "../utils/result";
import { type RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";

type WorkflowRunsDataArray =
  RestEndpointMethodTypes["actions"]["listWorkflowRunsForRepo"]["response"]["data"]["workflow_runs"];

type WorkflowRunsDataMap = IterableIterator<[number, WorkflowRunsDataArray]>;

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
      .then((_) => Result.Ok(`SUCCESS: Workflow run #${id} was deleted`))
      .catch((err) =>
        Result.Err(
          `ERROR: Failed to delete workflow run #${id}: ${err.message}`
        )
      );
  }

  async function deleteRuns(
    runs: WorkflowRunsDataArray
  ): Promise<Array<Result<string>>> {
    const resolved = await Promise.all(runs.map((r) => deleteRunById(r.id)));
    return resolved.filter(Boolean);
  }

  // FIXME: Refactor this monstruosity ASAP - 04/05/2024
  async function getWorkflowRuns(): Promise<Result<WorkflowRunsDataMap>> {
    const workflowsMap: Map<number, WorkflowRunsDataArray> = new Map();

    for await (const response of octokit.paginate.iterator(
      octokit.rest.actions.listRepoWorkflows,
      {
        owner,
        repo,
        per_page: 100,
      }
    )) {
      await setTimeout(1000); // bypass rate limiting.

      for (const workflow of response.data.workflows) {
        for await (const response of octokit.paginate.iterator(
          octokit.rest.actions.listWorkflowRuns,
          {
            owner,
            repo,
            workflow_id: workflow.id,
            status: "completed",
            per_page: 100,
          }
        )) {
          await setTimeout(1000); // bypass rate limiting.

          if (workflowsMap.has(workflow.id)) {
            workflowsMap.get(workflow.id).push(...response.data.workflow_runs);
          } else {
            workflowsMap.set(workflow.id, response.data.workflow_runs);
          }
        }
      }
    }

    return Result.Ok(workflowsMap.entries());
  }

  return {
    deleteRuns,
    deleteRunById,
    getWorkflowRuns,
  };
}
