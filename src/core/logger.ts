// SPDX-License-Identifier: MIT
import type { ApiMetrics } from "#src/types";

// Pure counterpart to `metrics` in `src/lib/logger.ts`: returns the summary
// as an array of lines instead of calling `info` directly, so the exact
// line content can be asserted without capturing console output. Reuses
// ApiMetrics instead of retyping its fields, so a future field added there
// can't silently go missing from this printout.
export function formatMetricsLines(metrics: ApiMetrics): string[] {
  return [
    "=== API Metrics ===",
    `Total API requests: ${metrics.totalRequests}`,
    `Successful requests: ${metrics.successfulRequests}`,
    `Failed requests: ${metrics.failedRequests}`,
    `Retry attempts: ${metrics.retries}`,
    `Rate limit hits: ${metrics.rateLimitHits}`,
    `Circuit breaker trips: ${metrics.circuitBreakerTrips}`,
    "==================",
  ];
}
