// SPDX-License-Identifier: MIT
import { CIRCUIT_BREAKER_CONFIG, CircuitState } from "../config/constants";
import type { CircuitBreakerHandle } from "../config/types";
import * as logger from "./logger";

export function createCircuitBreaker(): CircuitBreakerHandle {
  let state = CircuitState.CLOSED;
  let failureCount = 0;
  let successCount = 0;
  let lastFailureTime: number | null = null;

  function recordSuccess(): void {
    failureCount = 0;
    if (state === CircuitState.HALF_OPEN) {
      successCount++;
      if (successCount >= CIRCUIT_BREAKER_CONFIG.SUCCESS_THRESHOLD) {
        logger.info("Circuit breaker CLOSED - service recovered");
        state = CircuitState.CLOSED;
        successCount = 0;
      }
    }
  }

  function recordFailure(): void {
    failureCount++;
    lastFailureTime = Date.now();
    if (
      state === CircuitState.CLOSED &&
      failureCount >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD
    ) {
      logger.warn(`Circuit breaker OPEN - too many failures (${failureCount})`);
      state = CircuitState.OPEN;
    } else if (state === CircuitState.HALF_OPEN) {
      logger.warn("Circuit breaker OPEN - recovery failed");
      state = CircuitState.OPEN;
      successCount = 0;
    }
  }

  function canExecute(): boolean {
    if (state === CircuitState.CLOSED) return true;
    if (state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - (lastFailureTime || 0);
      if (timeSinceLastFailure >= CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS) {
        logger.info("Circuit breaker HALF_OPEN - testing recovery");
        state = CircuitState.HALF_OPEN;
        successCount = 0;
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN
  }

  function getState(): CircuitState {
    return state;
  }

  return { canExecute, recordSuccess, recordFailure, getState };
}
