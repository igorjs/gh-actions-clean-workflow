// SPDX-License-Identifier: MIT
import type { WorkflowStats } from "#src/core/api";
import {
  computeOutputs,
  computeWorkflowStatsMessages,
} from "#src/core/reporting";
import type { ApiMetrics } from "#src/types";
import * as logger from "./logger";

export const ZERO_METRICS: ApiMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  retries: 0,
  rateLimitHits: 0,
  circuitBreakerTrips: 0,
};

export function exportMetrics(
  totalRuns: number,
  succeeded: number,
  failed: number,
  metrics: ApiMetrics,
  setOut: (name: string, value: string) => void
): void {
  for (const [name, value] of Object.entries(
    computeOutputs(totalRuns, succeeded, failed, metrics)
  ))
    setOut(name, value);
}

export function logWorkflowStats(
  workflowStats: Map<number, WorkflowStats>,
  runsToKeep: number,
  actionVerb: string
): void {
  for (const msg of computeWorkflowStatsMessages(
    workflowStats,
    runsToKeep,
    actionVerb
  ))
    logger.info(msg);
}
