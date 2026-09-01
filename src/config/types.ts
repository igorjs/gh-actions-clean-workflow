// SPDX-License-Identifier: MIT
// Types shared by 3+ otherwise-unrelated modules. Everything else lives
// next to the module that owns it.

import type { RetryMetrics } from "#src/core/retry";

export type Sleep = (ms: number) => Promise<void>;

export interface ApiMetrics extends RetryMetrics {
  /** Number of times the circuit breaker tripped */
  circuitBreakerTrips: number;
}
