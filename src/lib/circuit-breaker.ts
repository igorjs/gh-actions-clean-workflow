/**
 * Circuit breaker implementation for preventing cascading failures
 */

import { CIRCUIT_BREAKER_CONFIG, CircuitState } from "../config/constants";
import type { ICircuitBreaker } from "../config/types";
import * as logger from "./logger";

/**
 * Circuit breaker to protect against cascading failures
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests are rejected
 * - HALF_OPEN: Testing if service has recovered
 */
export class CircuitBreaker implements ICircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;

  /**
   * Record a successful operation
   * Resets failure count and may transition from HALF_OPEN to CLOSED
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= CIRCUIT_BREAKER_CONFIG.SUCCESS_THRESHOLD) {
        logger.info("Circuit breaker CLOSED - service recovered");
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  /**
   * Record a failed operation
   * Increments failure count and may transition to OPEN state
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (
      this.state === CircuitState.CLOSED &&
      this.failureCount >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD
    ) {
      logger.warn(
        `Circuit breaker OPEN - too many failures (${this.failureCount})`
      );
      this.state = CircuitState.OPEN;
    } else if (this.state === CircuitState.HALF_OPEN) {
      logger.warn("Circuit breaker OPEN - recovery failed");
      this.state = CircuitState.OPEN;
      this.successCount = 0;
    }
  }

  /**
   * Check if an operation can be executed
   * May transition from OPEN to HALF_OPEN after timeout period
   *
   * @returns true if operation is allowed, false if circuit is open
   */
  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
      if (timeSinceLastFailure >= CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS) {
        logger.info("Circuit breaker HALF_OPEN - testing recovery");
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN - allow request to test recovery
    return true;
  }

  /**
   * Get current circuit state
   * @returns Current state (CLOSED, OPEN, or HALF_OPEN)
   */
  getState(): CircuitState {
    return this.state;
  }
}
