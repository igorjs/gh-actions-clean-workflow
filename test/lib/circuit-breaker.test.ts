// SPDX-License-Identifier: MIT
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { CIRCUIT_BREAKER_CONFIG, CircuitState } from "#src/config/constants";
import { createCircuitBreaker } from "#src/lib/circuit-breaker";

// This suite proves only the impure shell's own responsibilities: that its
// closed-over state variable actually persists and updates across separate
// method calls, and that the injected `now` (or its Date.now default) drives
// timeout tracking. Every state-machine branch (each CLOSED/OPEN/HALF_OPEN
// transition, tripCount bookkeeping, emitted events) is exercised directly
// against the pure functions in test/core/circuit-breaker.test.ts, so
// re-testing those branches here through the shell would only duplicate
// that coverage without proving anything new about the shell itself.
describe("CircuitBreaker shell", () => {
  let consoleInfoSpy: MockInstance;
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.useRealTimers();
  });

  it("persists state across multiple calls instead of resetting it each call", () => {
    const cb = createCircuitBreaker();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.getTripCount()).toBe(0);

    // Two failures short of the threshold: if the shell re-created its state
    // on every call instead of threading it through, this would never trip.
    for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD - 1; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe(CircuitState.CLOSED);

    cb.recordFailure();
    expect(cb.getState()).toBe(CircuitState.OPEN);
    expect(cb.getTripCount()).toBe(1);
  });

  it("uses an injected now instead of the wall clock to drive timeout recovery", () => {
    let currentTime = 0;
    const cb = createCircuitBreaker({ now: () => currentTime });

    for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);

    // The real wall clock never moves in this test, only the injected one
    // does. If canExecute() still read Date.now() internally, this would
    // stay OPEN forever instead of recovering.
    currentTime += CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS;
    expect(cb.canExecute()).toBe(true);
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it("defaults to Date.now when created with no deps", () => {
    vi.useFakeTimers();
    const cb = createCircuitBreaker();

    for (let i = 0; i < CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD; i++) {
      cb.recordFailure();
    }
    vi.advanceTimersByTime(CIRCUIT_BREAKER_CONFIG.TIMEOUT_MS);

    expect(cb.canExecute()).toBe(true);
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
  });
});
