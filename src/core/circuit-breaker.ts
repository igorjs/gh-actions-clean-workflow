// SPDX-License-Identifier: MIT
import { CIRCUIT_BREAKER_CONFIG, CircuitState } from "#src/config/constants";
import type { CircuitBreakerState, LogEvent } from "#src/config/types";

// Pure counterpart to `recordSuccess` in `src/lib/circuit-breaker.ts`:
// returns the next state and any log events instead of mutating shared
// state and calling the logger directly, so a transition can be tested
// and composed without mocking I/O.
export function applySuccess(state: CircuitBreakerState): {
  next: CircuitBreakerState;
  events: LogEvent[];
} {
  const next: CircuitBreakerState = { ...state, failureCount: 0 };
  const events: LogEvent[] = [];

  if (next.state === CircuitState.HALF_OPEN) {
    next.successCount++;
    if (next.successCount >= CIRCUIT_BREAKER_CONFIG.SUCCESS_THRESHOLD) {
      next.state = CircuitState.CLOSED;
      next.successCount = 0;
      events.push({
        level: "info",
        message: "Circuit breaker CLOSED - service recovered",
      });
    }
  }

  return { next, events };
}

// Pure counterpart to `recordFailure` in `src/lib/circuit-breaker.ts`. The
// two branches are intentionally asymmetric: CLOSED only trips after
// FAILURE_THRESHOLD failures, while a single failure while HALF_OPEN
// reopens immediately, since a probe failure means the service is still
// unhealthy. `now` is injected rather than read from `Date.now()` so the
// transition stays pure and deterministic under test.
export function applyFailure(
  state: CircuitBreakerState,
  now: number
): { next: CircuitBreakerState; events: LogEvent[] } {
  const next: CircuitBreakerState = {
    ...state,
    failureCount: state.failureCount + 1,
    lastFailureTime: now,
  };
  const events: LogEvent[] = [];

  if (
    next.state === CircuitState.CLOSED &&
    next.failureCount >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD
  ) {
    next.state = CircuitState.OPEN;
    next.tripCount++;
    events.push({
      level: "warn",
      message: `Circuit breaker OPEN - too many failures (${next.failureCount})`,
    });
  } else if (next.state === CircuitState.HALF_OPEN) {
    next.state = CircuitState.OPEN;
    next.successCount = 0;
    next.tripCount++;
    events.push({
      level: "warn",
      message: "Circuit breaker OPEN - recovery failed",
    });
  }

  return { next, events };
}

// Pure counterpart to `canExecute` in `src/lib/circuit-breaker.ts`: decides
// whether a call may proceed and, if the recovery timeout has elapsed on an
// OPEN circuit, returns the HALF_OPEN transition alongside it. Returns the
// same `state` reference (no allocation) whenever no transition happens.
export function checkExecutability(
  state: CircuitBreakerState,
  now: number
): { next: CircuitBreakerState; events: LogEvent[]; canExecute: boolean } {
  if (state.state === CircuitState.CLOSED) {
    return { next: state, events: [], canExecute: true };
  }

  if (state.state === CircuitState.OPEN) {
    const timeSinceLastFailure = now - (state.lastFailureTime || 0);
    if (timeSinceLastFailure >= CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS) {
      const next: CircuitBreakerState = {
        ...state,
        state: CircuitState.HALF_OPEN,
        successCount: 0,
      };
      return {
        next,
        events: [
          {
            level: "info",
            message: "Circuit breaker HALF_OPEN - testing recovery",
          },
        ],
        canExecute: true,
      };
    }
    return { next: state, events: [], canExecute: false };
  }

  return { next: state, events: [], canExecute: true }; // HALF_OPEN
}
