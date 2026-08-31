// SPDX-License-Identifier: MIT
import type { ApiMetrics, WorkflowStats } from "#src/config/types";

// Pure counterpart to `exportMetrics` in `src/index.ts`: returns the output
// key/value pairs instead of calling `setOutput` directly, so the mapping
// can be tested without an Actions runtime.
export function computeOutputs(
  totalRuns: number,
  succeeded: number,
  failed: number,
  metrics: ApiMetrics
): Record<string, string> {
  return {
    "total-runs-found": totalRuns.toString(),
    "runs-deleted": succeeded.toString(),
    "runs-failed": failed.toString(),
    "total-api-requests": metrics.totalRequests.toString(),
    "successful-requests": metrics.successfulRequests.toString(),
    "failed-requests": metrics.failedRequests.toString(),
    "retry-attempts": metrics.retries.toString(),
    "rate-limit-hits": metrics.rateLimitHits.toString(),
    "circuit-breaker-trips": metrics.circuitBreakerTrips.toString(),
  };
}

// Closes over nothing, so it's declared once at module scope instead of as
// an inline arrow rebuilt on every computeWorkflowStatsMessages call.
function hasRunsToDelete([, stats]: [number, WorkflowStats]): boolean {
  return stats.toDelete > 0;
}

// Pure counterpart to `logWorkflowStats` in `src/index.ts`: returns message
// strings instead of calling `logger.info` directly, so the filtering and
// formatting logic can be tested without capturing console output.
export function computeWorkflowStatsMessages(
  workflowStats: Map<number, WorkflowStats>,
  runsToKeep: number,
  actionVerb: string
): string[] {
  if (runsToKeep <= 0 || workflowStats.size === 0) {
    return [];
  }

  return [...workflowStats.entries()]
    .filter(hasRunsToDelete)
    .map(
      ([workflowId, stats]) =>
        `Workflow ${workflowId}: keeping ${
          stats.total - stats.toDelete
        } runs, ${actionVerb} ${stats.toDelete} runs`
    );
}
