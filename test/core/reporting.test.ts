// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { ApiMetrics } from "#src/config/types";
import {
  computeOutputs,
  computeWorkflowStatsMessages,
} from "#src/core/reporting";

function makeMetrics(): ApiMetrics {
  return {
    totalRequests: 10,
    successfulRequests: 8,
    failedRequests: 2,
    retries: 3,
    rateLimitHits: 1,
    circuitBreakerTrips: 0,
  };
}

describe("computeOutputs", () => {
  it("returns the nine output key/value pairs in the documented order", () => {
    // Arrange
    const totalRuns = 42;
    const succeeded = 40;
    const failed = 2;
    const metrics = makeMetrics();

    // Act
    const result = computeOutputs(totalRuns, succeeded, failed, metrics);

    // Assert
    expect(result).toEqual({
      "total-runs-found": "42",
      "runs-deleted": "40",
      "runs-failed": "2",
      "total-api-requests": "10",
      "successful-requests": "8",
      "failed-requests": "2",
      "retry-attempts": "3",
      "rate-limit-hits": "1",
      "circuit-breaker-trips": "0",
    });
    expect(Object.keys(result)).toEqual([
      "total-runs-found",
      "runs-deleted",
      "runs-failed",
      "total-api-requests",
      "successful-requests",
      "failed-requests",
      "retry-attempts",
      "rate-limit-hits",
      "circuit-breaker-trips",
    ]);
  });
});

describe("computeWorkflowStatsMessages", () => {
  it("returns an empty array when runsToKeep is zero", () => {
    // Arrange
    const workflowStats = new Map([[1, { total: 5, toDelete: 3 }]]);

    // Act
    const result = computeWorkflowStatsMessages(workflowStats, 0, "deleting");

    // Assert
    expect(result).toEqual([]);
  });

  it("returns an empty array when runsToKeep is negative", () => {
    // Arrange
    const workflowStats = new Map([[1, { total: 5, toDelete: 3 }]]);

    // Act
    const result = computeWorkflowStatsMessages(workflowStats, -1, "deleting");

    // Assert
    expect(result).toEqual([]);
  });

  it("returns an empty array when workflowStats is empty", () => {
    // Arrange
    const workflowStats = new Map<
      number,
      { total: number; toDelete: number }
    >();

    // Act
    const result = computeWorkflowStatsMessages(workflowStats, 5, "deleting");

    // Assert
    expect(result).toEqual([]);
  });

  it("excludes a workflow with toDelete: 0 from the result", () => {
    // Arrange
    const workflowStats = new Map([[1, { total: 5, toDelete: 0 }]]);

    // Act
    const result = computeWorkflowStatsMessages(workflowStats, 5, "deleting");

    // Assert
    expect(result).toEqual([]);
  });

  it("uses the given action verb verbatim in each message", () => {
    // Arrange
    const workflowStats = new Map([[1, { total: 5, toDelete: 3 }]]);

    // Act
    const result = computeWorkflowStatsMessages(
      workflowStats,
      5,
      "would delete"
    );

    // Assert
    expect(result).toEqual(["Workflow 1: keeping 2 runs, would delete 3 runs"]);
  });

  it("returns one message per workflow with nonzero toDelete, in Map iteration order", () => {
    // Arrange
    const workflowStats = new Map([
      [1, { total: 5, toDelete: 3 }],
      [2, { total: 10, toDelete: 0 }],
      [3, { total: 7, toDelete: 2 }],
    ]);

    // Act
    const result = computeWorkflowStatsMessages(workflowStats, 5, "deleting");

    // Assert
    expect(result).toEqual([
      "Workflow 1: keeping 2 runs, deleting 3 runs",
      "Workflow 3: keeping 5 runs, deleting 2 runs",
    ]);
  });
});
