// SPDX-License-Identifier: MIT
import {
  applyFailure,
  applySuccess,
  type CircuitBreakerState,
  CircuitState,
  checkExecutability,
  type LogEvent,
} from "#src/core/circuit-breaker";
import * as logger from "./logger";

export type CircuitBreakerHandle = {
  canExecute: () => boolean;
  recordSuccess: () => void;
  recordFailure: () => void;
  getState: () => CircuitState;
  getTripCount: () => number;
};

// The pure transition functions return events instead of logging directly,
// so every one of them needs the exact same event-to-logger routing. Doing
// that here once keeps recordSuccess/recordFailure/canExecute free of
// duplicated if/else blocks.
function dispatch(events: LogEvent[]): void {
  for (const event of events) {
    if (event.level === "info") {
      logger.info(event.message);
    } else {
      logger.warn(event.message);
    }
  }
}

export function createCircuitBreaker(deps?: {
  now?: () => number;
}): CircuitBreakerHandle {
  // Defaulting to Date.now here, rather than inline at each call site, lets
  // tests inject a controllable clock without needing fake timers or
  // touching the global Date object.
  const now = deps?.now ?? Date.now;

  // The only mutable state in this module: a thin impure shell threading
  // this value through the pure transition functions in
  // #src/core/circuit-breaker on every call.
  let s: CircuitBreakerState = {
    state: CircuitState.CLOSED,
    failureCount: 0,
    successCount: 0,
    lastFailureTime: null,
    tripCount: 0,
  };

  function recordSuccess(): void {
    const { next, events } = applySuccess(s);
    s = next;
    dispatch(events);
  }

  function recordFailure(): void {
    const { next, events } = applyFailure(s, now());
    s = next;
    dispatch(events);
  }

  function canExecute(): boolean {
    const { next, events, canExecute } = checkExecutability(s, now());
    s = next;
    dispatch(events);
    return canExecute;
  }

  function getState(): CircuitState {
    return s.state;
  }

  function getTripCount(): number {
    return s.tripCount;
  }

  return { canExecute, recordSuccess, recordFailure, getState, getTripCount };
}
