// SPDX-License-Identifier: MIT

// Pure counterpart to `metrics` in `src/lib/logger.ts`: returns the summary
// as an array of lines instead of calling `info` directly, so the exact
// line content can be asserted without capturing console output.
export function formatMetricsLines(metrics: {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retries: number;
  rateLimitHits: number;
  circuitBreakerTrips: number;
}): string[] {
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
