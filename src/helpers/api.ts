import { setTimeout } from "node:timers/promises";

import { getOctokit } from "@actions/github";
import { type RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";

export type WorkflowData =
  RestEndpointMethodTypes["actions"]["listRepoWorkflows"]["response"]["data"]["workflows"][0];

export type WorkflowRunData =
  RestEndpointMethodTypes["actions"]["listWorkflowRunsForRepo"]["response"]["data"]["workflow_runs"][0];

export type WorkflowDataMapEntry = {
  workflow: WorkflowData;
  runs: Array<WorkflowRunData>;
};

export type WorkflowDataMapValues = IterableIterator<WorkflowDataMapEntry>;

export function getApi({ token, owner, repo }) {
  /**
   * https://octokit.github.io/rest.js/v20
   **/
  const client = getOctokit(token);

  async function deleteRunById(id: number): Promise<void> {
    try {
      console.info(`INFO: Deleting run #${id}"`);
      await client.rest.actions.deleteWorkflowRun({ owner, repo, run_id: id });
      console.info(`SUCCESS: Run #${id} was deleted`);
    } catch (err) {
      console.error(`ERROR: Failed to delete run #${id}: ${err.message}`);
    } finally {
      await setTimeout(1000); // rate limiting.
    }
  }

  async function deleteRuns(
    runs: Array<WorkflowRunData>
  ): Promise<{ succeeded: number; failed: number }> {
    const rs = await Promise.allSettled(runs.map((r) => deleteRunById(r.id)));
    const failed = rs.filter((r) => r.status === "rejected").length;
    const succeeded = rs.filter((r) => r.status === "fulfilled").length;
    return { failed, succeeded };
  }

  // FIXME: Refactor this monstruosity ASAP - 04/05/2024
  async function getWorkflowRuns(): Promise<WorkflowDataMapValues> {
    const workflowsMap: Map<number, WorkflowDataMapEntry> = new Map();

    const workflows = await client.paginate(
      client.rest.actions.listRepoWorkflows,
      {
        owner,
        repo,
        per_page: 100,
      }
    );

    for (const workflow of workflows) {
      await setTimeout(1000); // bypass rate limiting.

      const runs = await client.paginate(client.rest.actions.listWorkflowRuns, {
        owner,
        repo,
        workflow_id: workflow.id,
        status: "completed",
        per_page: 100,
      });

      if (workflowsMap.has(workflow.id)) {
        workflowsMap.get(workflow.id).runs.push(...runs);
      } else {
        workflowsMap.set(workflow.id, { workflow, runs });
      }
    }

    return workflowsMap.values();
  }

  return {
    deleteRuns,
    deleteRunById,
    getWorkflowRuns,
  };
}
