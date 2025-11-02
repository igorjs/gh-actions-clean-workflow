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
      // Rate limiting: GitHub allows 180 DELETE/min (900 points ÷ 5 points per DELETE)
      // 350ms = ~170 deletions/min with safety margin
      await setTimeout(350);
    }
  }

  async function deleteRuns(
    runs: number[]
  ): Promise<{ succeeded: number; failed: number }> {
    const BATCH_SIZE = 20; // Process deletions in batches to respect GitHub's 100 concurrent request limit
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < runs.length; i += BATCH_SIZE) {
      const batch = runs.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((id) => deleteRunById(id))
      );

      // Single-pass counting
      for (const result of results) {
        if (result.status === "fulfilled") {
          succeeded++;
        } else {
          failed++;
        }
      }
    }

    return { failed, succeeded };
  }

  async function getWorkflowRuns(
    olderThanDays?: number
  ): Promise<WorkflowRun[]> {
    const runs: WorkflowRun[] = [];
    let created: string | undefined;

    // If olderThanDays is provided, create a date range filter
    if (olderThanDays !== undefined && olderThanDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      // Format: <YYYY-MM-DD
      created = `<${cutoffDate.toISOString().split("T")[0]}`;
    }

    // Use iterator for memory efficiency - processes one page at a time
    for await (const response of octokit.paginate.iterator(
      octokit.rest.actions.listWorkflowRunsForRepo,
      {
        owner,
        repo,
        status: "completed",
        per_page: 100,
        ...(created && { created }),
      }
    )) {
      for (const run of response.data) {
        runs.push({
          id: run.id,
          workflow_id: run.workflow_id,
          created_at: run.created_at,
        });
      }
    }

    return runs;
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

    // If runsToKeep is 0, undefined, or negative, delete all runs
    const keepCount = Math.max(0, runsToKeep || 0);

    for (const [workflowId, workflowRuns] of runsByWorkflow) {
      // Sort runs by created_at descending (newest first)
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

      // Collect run IDs to delete
      for (const run of runsToDelete) {
        runIds.push(run.id);
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
