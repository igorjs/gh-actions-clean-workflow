// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { formatMetricsLines } from "#src/core/logger";

describe("formatMetricsLines", () => {
  it("returns the exact eight-line metrics summary", () => {
    // Arrange
    const metrics = {
      totalRequests: 10,
      successfulRequests: 8,
      failedRequests: 2,
      retries: 3,
      rateLimitHits: 1,
      circuitBreakerTrips: 0,
    };

    // Act
    const result = formatMetricsLines(metrics);

    // Assert
    expect(result).toEqual([
      "=== API Metrics ===",
      "Total API requests: 10",
      "Successful requests: 8",
      "Failed requests: 2",
      "Retry attempts: 3",
      "Rate limit hits: 1",
      "Circuit breaker trips: 0",
      "==================",
    ]);
  });
});
