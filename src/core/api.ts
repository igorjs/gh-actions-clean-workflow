// SPDX-License-Identifier: MIT
import type { RunsToDeleteResult, WorkflowRun } from "#src/config/types";

// Pure counterpart to `getRunsToDelete` in `src/lib/api.ts`: computes which
// runs to delete from an already-fetched, already-filtered list of runs
// instead of paginating the GitHub API itself, so the grouping/sorting/
// slicing logic can be tested without mocking octokit.
export function computeRunsToDelete(
  runs: WorkflowRun[],
  runsToKeep?: number
): RunsToDeleteResult {
  const totalRuns = runs.length;

  if (totalRuns === 0) {
    return { runIds: [], totalRuns: 0, workflowStats: new Map() };
  }

  const runsByWorkflow = Map.groupBy(runs, (run) => run.workflow_id);
  const keepCount = Math.max(0, runsToKeep || 0);

  const workflowEntries = [...runsByWorkflow].map(
    ([workflowId, workflowRuns]) => {
      const sorted = workflowRuns.toSorted(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return { workflowId, sorted, toDelete: sorted.slice(keepCount) };
    }
  );

  const workflowStats = new Map(
    workflowEntries.map(({ workflowId, sorted, toDelete }) => [
      workflowId,
      { total: sorted.length, toDelete: toDelete.length },
    ])
  );
  const runIds = workflowEntries.flatMap(({ toDelete }) =>
    toDelete.map((run) => run.id)
  );

  return { runIds, totalRuns, workflowStats };
}
