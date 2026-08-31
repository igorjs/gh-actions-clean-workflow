// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { computeRunsToDelete } from "#src/core/api";
import { makeWorkflowRuns } from "#test/lib/api.test-helpers";

describe("computeRunsToDelete", () => {
  const mockRuns = [
    { id: 1, workflow_id: 100, created_at: "2024-01-05T00:00:00Z", name: "" },
    { id: 2, workflow_id: 100, created_at: "2024-01-04T00:00:00Z", name: "" },
    { id: 3, workflow_id: 100, created_at: "2024-01-03T00:00:00Z", name: "" },
    { id: 4, workflow_id: 100, created_at: "2024-01-02T00:00:00Z", name: "" },
    { id: 5, workflow_id: 200, created_at: "2024-01-05T00:00:00Z", name: "" },
    { id: 6, workflow_id: 200, created_at: "2024-01-01T00:00:00Z", name: "" },
  ];

  it("should return all runs when runsToKeep is 0", () => {
    const result = computeRunsToDelete(mockRuns, 0);
    expect(result.runIds).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.totalRuns).toBe(6);
    expect(result.workflowStats.get(100)).toEqual({ total: 4, toDelete: 4 });
    expect(result.workflowStats.get(200)).toEqual({ total: 2, toDelete: 2 });
  });

  it("should keep specified number of runs per workflow", () => {
    const result = computeRunsToDelete(mockRuns, 2);
    expect(result.runIds).toEqual([3, 4]);
    expect(result.workflowStats.get(100)).toEqual({ total: 4, toDelete: 2 });
    expect(result.workflowStats.get(200)).toEqual({ total: 2, toDelete: 0 });
  });

  it("should handle workflows with fewer runs than runsToKeep", () => {
    const result = computeRunsToDelete(mockRuns, 10);
    expect(result.runIds).toEqual([]);
    expect(result.totalRuns).toBe(6);
  });

  it("should handle empty runs", () => {
    const result = computeRunsToDelete([], 5);
    expect(result.runIds).toEqual([]);
    expect(result.totalRuns).toBe(0);
    expect(result.workflowStats.size).toBe(0);
  });

  it("should delete nothing when runs_to_keep equals totalRuns for a single workflow", () => {
    // Boundary: keepCount === totalRuns must retain every run
    // (toDelete: 0), not off-by-one delete the oldest one.
    const count = 50;
    const runs = makeWorkflowRuns({ count });
    const result = computeRunsToDelete(runs, count);

    expect(result.runIds).toEqual([]);
    expect(result.totalRuns).toBe(count);
    expect(result.workflowStats.get(100)).toEqual({
      total: count,
      toDelete: 0,
    });
  });

  it("should compute exact deletion counts across 1000 runs spread over 10 workflows", () => {
    // Stress-scale correctness: with round-robin distribution every
    // workflow ends up with count/workflowIdCount runs, so
    // runIds.length must equal count - workflowIdCount * keepCount
    // exactly, and each workflow's stats must reflect its own
    // total/toDelete, not an approximation.
    const count = 1000;
    const workflowIdCount = 10;
    const keepCount = 5;
    const runs = makeWorkflowRuns({ count, workflowIdCount });
    const result = computeRunsToDelete(runs, keepCount);

    expect(result.totalRuns).toBe(count);
    expect(result.runIds).toHaveLength(count - workflowIdCount * keepCount);
    expect(result.workflowStats.size).toBe(workflowIdCount);
    const perWorkflowTotal = count / workflowIdCount;
    for (
      let workflowId = 100;
      workflowId < 100 + workflowIdCount;
      workflowId++
    ) {
      expect(result.workflowStats.get(workflowId)).toEqual({
        total: perWorkflowTotal,
        toDelete: perWorkflowTotal - keepCount,
      });
    }
  });

  it("should compute exact deletion counts across 10000 runs spread over 50 workflows", () => {
    // Same stress-scale correctness guard as the 1000/10 case, at a
    // larger scale to catch anything that only breaks past a small N.
    const count = 10000;
    const workflowIdCount = 50;
    const keepCount = 5;
    const runs = makeWorkflowRuns({ count, workflowIdCount });
    const result = computeRunsToDelete(runs, keepCount);

    expect(result.totalRuns).toBe(count);
    expect(result.runIds).toHaveLength(count - workflowIdCount * keepCount);
    expect(result.workflowStats.size).toBe(workflowIdCount);
    const perWorkflowTotal = count / workflowIdCount;
    for (
      let workflowId = 100;
      workflowId < 100 + workflowIdCount;
      workflowId++
    ) {
      expect(result.workflowStats.get(workflowId)).toEqual({
        total: perWorkflowTotal,
        toDelete: perWorkflowTotal - keepCount,
      });
    }
  });
});
