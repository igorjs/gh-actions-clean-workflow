// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  applyFailure,
  applySuccess,
  CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerState,
  CircuitState,
  checkExecutability,
  type LogEvent,
} from "#src/core/circuit-breaker";

function makeState(
  overrides: Partial<CircuitBreakerState> = {}
): CircuitBreakerState {
  return {
    state: CircuitState.CLOSED,
    failureCount: 0,
    successCount: 0,
    lastFailureTime: null,
    tripCount: 0,
    ...overrides,
  };
}

describe("applySuccess", () => {
  it("resets failureCount to 0 when CLOSED, without changing state or emitting events", () => {
    // Arrange
    const state = makeState({ state: CircuitState.CLOSED, failureCount: 3 });

    // Act
    const result = applySuccess(state);

    // Assert
    expect(result.next.failureCount).toBe(0);
    expect(result.next.state).toBe(CircuitState.CLOSED);
    expect(result.events).toEqual([]);
  });

  it("increments successCount when HALF_OPEN below SUCCESS_THRESHOLD, without transitioning", () => {
    // Arrange
    const state = makeState({ state: CircuitState.HALF_OPEN, successCount: 0 });

    // Act
    const result = applySuccess(state);

    // Assert
    expect(result.next.successCount).toBe(1);
    expect(result.next.state).toBe(CircuitState.HALF_OPEN);
    expect(result.events).toEqual([]);
  });

  it("transitions HALF_OPEN to CLOSED and resets successCount when reaching SUCCESS_THRESHOLD", () => {
    // Arrange
    const state = makeState({
      state: CircuitState.HALF_OPEN,
      successCount: CIRCUIT_BREAKER_CONFIG.SUCCESS_THRESHOLD - 1,
    });

    // Act
    const result = applySuccess(state);

    // Assert
    expect(result.next.state).toBe(CircuitState.CLOSED);
    expect(result.next.successCount).toBe(0);
    expect(result.events).toEqual([
      { level: "info", message: "Circuit breaker CLOSED - service recovered" },
    ]);
  });
});

describe("applyFailure", () => {
  describe.each([
    {
      label: "CLOSED below FAILURE_THRESHOLD",
      initial: makeState({
        state: CircuitState.CLOSED,
        failureCount: CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD - 2,
      }),
      expectedState: CircuitState.CLOSED,
      expectedTripCount: 0,
    },
    {
      label: "OPEN with a further failure (regression pin)",
      initial: makeState({
        state: CircuitState.OPEN,
        failureCount: CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD,
        tripCount: 1,
      }),
      expectedState: CircuitState.OPEN,
      expectedTripCount: 1,
    },
  ])("when $label", ({ initial, expectedState, expectedTripCount }) => {
    it("increments failureCount, sets lastFailureTime, stays in state, emits no events", () => {
      // Arrange
      const now = 5000;

      // Act
      const result = applyFailure(initial, now);

      // Assert
      expect(result.next.failureCount).toBe(initial.failureCount + 1);
      expect(result.next.state).toBe(expectedState);
      expect(result.next.tripCount).toBe(expectedTripCount);
      expect(result.next.lastFailureTime).toBe(now);
      expect(result.events).toEqual([]);
    });
  });

  it("transitions CLOSED to OPEN and trips the breaker when reaching FAILURE_THRESHOLD", () => {
    // Arrange
    const state = makeState({
      state: CircuitState.CLOSED,
      failureCount: CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD - 1,
    });
    const now = 7000;

    // Act
    const result = applyFailure(state, now);

    // Assert
    expect(result.next.state).toBe(CircuitState.OPEN);
    expect(result.next.failureCount).toBe(
      CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD
    );
    expect(result.next.tripCount).toBe(1);
    expect(result.next.lastFailureTime).toBe(now);
    expect(result.events).toEqual([
      {
        level: "warn",
        message: `Circuit breaker OPEN - too many failures (${CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD})`,
      },
    ]);
  });

  it("transitions HALF_OPEN back to OPEN and trips the breaker again on failure", () => {
    // Arrange
    const state = makeState({
      state: CircuitState.HALF_OPEN,
      successCount: 1,
      tripCount: 1,
    });
    const now = 8000;

    // Act
    const result = applyFailure(state, now);

    // Assert
    expect(result.next.state).toBe(CircuitState.OPEN);
    expect(result.next.successCount).toBe(0);
    expect(result.next.tripCount).toBe(2);
    expect(result.next.lastFailureTime).toBe(now);
    expect(result.events).toEqual([
      { level: "warn", message: "Circuit breaker OPEN - recovery failed" },
    ]);
  });
});

describe("checkExecutability", () => {
  describe.each([
    { label: "CLOSED", initial: CircuitState.CLOSED },
    { label: "HALF_OPEN", initial: CircuitState.HALF_OPEN },
  ])("when $label", ({ initial }) => {
    it("allows execution and leaves the state unchanged", () => {
      // Arrange
      const state = makeState({ state: initial, successCount: 1 });

      // Act
      const result = checkExecutability(state, 999);

      // Assert
      expect(result.canExecute).toBe(true);
      expect(result.next).toEqual(state);
      expect(result.events).toEqual([]);
    });
  });

  it("keeps OPEN and rejects execution when the timeout has not elapsed", () => {
    // Arrange
    const lastFailureTime = 1000;
    const state = makeState({ state: CircuitState.OPEN, lastFailureTime });

    // Act
    const result = checkExecutability(
      state,
      lastFailureTime + CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS - 1
    );

    // Assert
    expect(result.canExecute).toBe(false);
    expect(result.next).toEqual(state);
    expect(result.events).toEqual([]);
  });

  it.each([
    {
      label: "elapsed exactly TIMEOUT_MS",
      elapsed: CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS,
    },
    {
      label: "elapsed one ms over TIMEOUT_MS",
      elapsed: CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS + 1,
    },
  ])(
    "transitions OPEN to HALF_OPEN once the timeout has elapsed ($label)",
    ({ elapsed }) => {
      // Arrange
      const lastFailureTime = 1000;
      const state = makeState({
        state: CircuitState.OPEN,
        lastFailureTime,
        successCount: 1,
      });

      // Act
      const result = checkExecutability(state, lastFailureTime + elapsed);

      // Assert
      expect(result.canExecute).toBe(true);
      expect(result.next.state).toBe(CircuitState.HALF_OPEN);
      expect(result.next.successCount).toBe(0);
      expect(result.events).toEqual([
        {
          level: "info",
          message: "Circuit breaker HALF_OPEN - testing recovery",
        },
      ]);
    }
  );
});

describe("immutability of input state", () => {
  it("does not mutate the input state in applySuccess", () => {
    // Arrange
    const state = makeState({ state: CircuitState.HALF_OPEN, successCount: 1 });
    const before = structuredClone(state);

    // Act
    applySuccess(state);

    // Assert
    expect(state).toEqual(before);
  });

  it("does not mutate the input state in applyFailure", () => {
    // Arrange
    const state = makeState({ state: CircuitState.CLOSED, failureCount: 2 });
    const before = structuredClone(state);

    // Act
    applyFailure(state, 1234);

    // Assert
    expect(state).toEqual(before);
  });

  it("does not mutate the input state in checkExecutability", () => {
    // Arrange
    const state = makeState({ state: CircuitState.OPEN, lastFailureTime: 0 });
    const before = structuredClone(state);

    // Act
    checkExecutability(state, CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS);

    // Assert
    expect(state).toEqual(before);
  });
});

describe("regression: full state-machine cycles", () => {
  it("completes a full CLOSED -> OPEN -> HALF_OPEN -> CLOSED cycle with correct tripCount", () => {
    // Arrange
    let state = makeState();
    let events: LogEvent[] = [];
    const start = 10_000;

    // Act: FAILURE_THRESHOLD failures trip the breaker
    for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD; i++) {
      const result = applyFailure(state, start + i);
      state = result.next;
      events = result.events;
    }

    // Assert: tripped to OPEN, tripCount 1
    expect(state.state).toBe(CircuitState.OPEN);
    expect(state.tripCount).toBe(1);
    expect(events).toEqual([
      {
        level: "warn",
        message: `Circuit breaker OPEN - too many failures (${CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD})`,
      },
    ]);

    // Act: the timeout elapses, checkExecutability moves to HALF_OPEN
    const afterTimeout =
      (state.lastFailureTime || 0) + CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS;
    const checkResult = checkExecutability(state, afterTimeout);
    state = checkResult.next;

    // Assert: HALF_OPEN, tripCount unchanged
    expect(checkResult.canExecute).toBe(true);
    expect(state.state).toBe(CircuitState.HALF_OPEN);
    expect(state.tripCount).toBe(1);

    // Act: SUCCESS_THRESHOLD successes recover the breaker
    for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.SUCCESS_THRESHOLD; i++) {
      const result = applySuccess(state);
      state = result.next;
      events = result.events;
    }

    // Assert: CLOSED, tripCount still 1 (recovery never increments trips)
    expect(state.state).toBe(CircuitState.CLOSED);
    expect(state.tripCount).toBe(1);
    expect(events).toEqual([
      { level: "info", message: "Circuit breaker CLOSED - service recovered" },
    ]);
  });

  it("tracks cumulative tripCount exactly across 3 full trip/recover cycles", () => {
    // Arrange
    let state = makeState();
    let now = 100_000;

    for (let cycle = 1; cycle <= 3; cycle++) {
      // Act: FAILURE_THRESHOLD failures trip the breaker
      for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD; i++) {
        state = applyFailure(state, now++).next;
      }

      // Assert: tripCount reaches this cycle's count
      expect(state.state).toBe(CircuitState.OPEN);
      expect(state.tripCount).toBe(cycle);

      // Act: the timeout elapses, checkExecutability moves to HALF_OPEN
      now += CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS;
      state = checkExecutability(state, now).next;

      // Assert: HALF_OPEN before recovering
      expect(state.state).toBe(CircuitState.HALF_OPEN);

      // Act: SUCCESS_THRESHOLD successes recover the breaker
      for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.SUCCESS_THRESHOLD; i++) {
        state = applySuccess(state).next;
      }

      // Assert: recovery never increments tripCount
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.tripCount).toBe(cycle);
    }
  });
});
