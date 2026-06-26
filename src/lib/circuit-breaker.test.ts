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
import { CircuitState } from "../config/constants";
import { createCircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
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

  describe("Initial state", () => {
    it("should start in CLOSED state", () => {
      const cb = createCircuitBreaker();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it("should allow execution in CLOSED state", () => {
      const cb = createCircuitBreaker();
      expect(cb.canExecute()).toBe(true);
    });
  });

  describe("CLOSED state behavior", () => {
    it("should remain CLOSED after successful operations", () => {
      const cb = createCircuitBreaker();
      cb.recordSuccess();
      cb.recordSuccess();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it("should transition to OPEN after reaching failure threshold", () => {
      const cb = createCircuitBreaker();
      // FAILURE_THRESHOLD is 5
      for (let i = 0; i < 5; i++) cb.recordFailure();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it("should reset failure count on success", () => {
      const cb = createCircuitBreaker();
      for (let i = 0; i < 4; i++) cb.recordFailure();
      cb.recordSuccess();
      // One more failure shouldn't open (count was reset)
      cb.recordFailure();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("OPEN state behavior", () => {
    it("should reject execution when OPEN", () => {
      const cb = createCircuitBreaker();
      for (let i = 0; i < 5; i++) cb.recordFailure();
      expect(cb.canExecute()).toBe(false);
    });

    it("should remain OPEN before timeout expires", () => {
      vi.useFakeTimers();
      const cb = createCircuitBreaker();
      for (let i = 0; i < 5; i++) cb.recordFailure();
      vi.advanceTimersByTime(59999); // just under 60s timeout
      expect(cb.canExecute()).toBe(false);
    });

    it("should transition to HALF_OPEN after timeout", () => {
      vi.useFakeTimers();
      const cb = createCircuitBreaker();
      for (let i = 0; i < 5; i++) cb.recordFailure();
      vi.advanceTimersByTime(60000);
      expect(cb.canExecute()).toBe(true);
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe("HALF_OPEN state behavior", () => {
    function openThenHalfOpen(): ReturnType<typeof createCircuitBreaker> {
      vi.useFakeTimers();
      const cb = createCircuitBreaker();
      for (let i = 0; i < 5; i++) cb.recordFailure();
      vi.advanceTimersByTime(60000);
      cb.canExecute(); // triggers HALF_OPEN transition
      return cb;
    }

    it("should allow execution in HALF_OPEN state", () => {
      const cb = openThenHalfOpen();
      expect(cb.canExecute()).toBe(true);
    });

    it("should transition to CLOSED after success threshold", () => {
      const cb = openThenHalfOpen();
      // SUCCESS_THRESHOLD is 2
      cb.recordSuccess();
      cb.recordSuccess();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it("should transition back to OPEN on failure", () => {
      const cb = openThenHalfOpen();
      cb.recordFailure();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it("should not accumulate success count after transitioning to CLOSED", () => {
      const cb = openThenHalfOpen();
      cb.recordSuccess();
      cb.recordSuccess(); // → CLOSED
      // Fail 4 times: should stay CLOSED (success count was reset)
      for (let i = 0; i < 4; i++) cb.recordFailure();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("State transitions", () => {
    it("complete cycle: CLOSED → OPEN → HALF_OPEN → CLOSED", () => {
      vi.useFakeTimers();
      const cb = createCircuitBreaker();
      for (let i = 0; i < 5; i++) cb.recordFailure();
      expect(cb.getState()).toBe(CircuitState.OPEN);
      vi.advanceTimersByTime(60000);
      cb.canExecute();
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
      cb.recordSuccess();
      cb.recordSuccess();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it("complete cycle: CLOSED → OPEN → HALF_OPEN → OPEN", () => {
      vi.useFakeTimers();
      const cb = createCircuitBreaker();
      for (let i = 0; i < 5; i++) cb.recordFailure();
      vi.advanceTimersByTime(60000);
      cb.canExecute();
      cb.recordFailure();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe("Edge cases", () => {
    it("should handle success in CLOSED state without issues", () => {
      const cb = createCircuitBreaker();
      expect(() => cb.recordSuccess()).not.toThrow();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it("should handle partial success in HALF_OPEN", () => {
      vi.useFakeTimers();
      const cb = createCircuitBreaker();
      for (let i = 0; i < 5; i++) cb.recordFailure();
      vi.advanceTimersByTime(60000);
      cb.canExecute();
      cb.recordSuccess(); // only 1 of 2 needed
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });
});
