import { setTimeout } from "node:timers/promises";

import { getOctokit } from "@actions/github";

type WorkflowRun = {
  id: number;
  workflow_id: number;
  created_at: string;
};

type ApiParams = {
  token: string;
  owner: string;
  repo: string;
};

type Api = {
  deleteRuns: (
    runs: number[]
  ) => Promise<{ succeeded: number; failed: number }>;
  getRunsToDelete: (
    olderThanDays?: number,
    runsToKeep?: number
  ) => Promise<{
    runIds: number[];
    totalRuns: number;
    workflowStats: Map<number, { total: number; toDelete: number }>;
  }>;
};

export function getApi({ token, owner, repo }: ApiParams): Api {
  /**
   * https://octokit.github.io/rest.js/v20
   **/
  const octokit = getOctokit(token);

  async function deleteRunById(id: number): Promise<void> {
    try {
      console.info(`INFO: Deleting run #${id}`);
      await octokit.rest.actions.deleteWorkflowRun({ owner, repo, run_id: id });
      console.info(`SUCCESS: Run #${id} was deleted`);
    } catch (err) {
      console.error(`ERROR: Failed to delete run #${id}: ${err.message}`);
      throw err; // Re-throw to mark promise as rejected
    } finally {
      await setTimeout(1000); // rate limiting.
    }
  }

  async function deleteRuns(
    runs: number[]
  ): Promise<{ succeeded: number; failed: number }> {
    const rs = await Promise.allSettled(runs.map((id) => deleteRunById(id)));
    const succeeded = rs.filter((r) => r.status === "fulfilled").length;
    const failed = rs.filter((r) => r.status === "rejected").length;
    return { failed, succeeded };
  }

  async function getWorkflowRuns(
    olderThanDays?: number
  ): Promise<WorkflowRun[]> {
    let created: string | undefined;

    // If olderThanDays is provided, create a date range filter
    if (olderThanDays !== undefined && olderThanDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      // Format: <YYYY-MM-DD
      created = `<${cutoffDate.toISOString().split("T")[0]}`;
    }

    const runs = await octokit.paginate(
      octokit.rest.actions.listWorkflowRunsForRepo,
      {
        owner,
        repo,
        status: "completed",
        per_page: 100,
        ...(created && { created }),
      }
    );

    // Return runs with id, workflow_id, and created_at for grouping and sorting
    return runs.map((run) => ({
      id: run.id,
      workflow_id: run.workflow_id,
      created_at: run.created_at,
    }));
  }

  async function getRunsToDelete(
    olderThanDays?: number,
    runsToKeep?: number
  ): Promise<{
    runIds: number[];
    totalRuns: number;
    workflowStats: Map<number, { total: number; toDelete: number }>;
  }> {
    const runs = await getWorkflowRuns(olderThanDays);
    const totalRuns = runs.length;

    if (totalRuns === 0) {
      return {
        runIds: [],
        totalRuns: 0,
        workflowStats: new Map(),
      };
    }

    // Group runs by workflow_id
    const runsByWorkflow = new Map<number, WorkflowRun[]>();
    for (const run of runs) {
      const workflowId = run.workflow_id;
      if (!runsByWorkflow.has(workflowId)) {
        runsByWorkflow.set(workflowId, []);
      }
      runsByWorkflow.get(workflowId).push(run);
    }

    // Collect run IDs to delete and stats, applying runsToKeep per workflow
    const runIds: number[] = [];
    const workflowStats = new Map<
      number,
      { total: number; toDelete: number }
    >();

    // If runsToKeep is 0 or undefined, delete all runs
    const keepCount = runsToKeep || 0;

    for (const [workflowId, workflowRuns] of runsByWorkflow) {
      // Sort runs by created_at descending (newest first) to ensure runsToKeep works correctly
      workflowRuns.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Skip the most recent runsToKeep runs
      const runsToDelete = workflowRuns.slice(keepCount);

      workflowStats.set(workflowId, {
        total: workflowRuns.length,
        toDelete: runsToDelete.length,
      });

      if (runsToDelete.length > 0) {
        runIds.push(...runsToDelete.map((run) => run.id));
      }
    }

    return {
      runIds,
      totalRuns,
      workflowStats,
    };
  }

  return {
    deleteRuns,
    getRunsToDelete,
  };
}
