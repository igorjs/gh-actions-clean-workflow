import { describe, test, expect, vi, afterEach, beforeEach } from "vitest";
import { CircuitBreaker } from "./circuit-breaker";
import { CircuitState } from "../config/constants";

// Mock the logger
vi.mock("./logger");

import { Logger } from "./logger";

const mockLoggerInfo = vi.mocked(Logger.info);
const mockLoggerWarn = vi.mocked(Logger.warn);

describe("CircuitBreaker", () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreaker = new CircuitBreaker();
  });

  describe("Initial state", () => {
    test("should start in CLOSED state", () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should allow execution in CLOSED state", () => {
      expect(circuitBreaker.canExecute()).toBe(true);
    });
  });

  describe("CLOSED state behavior", () => {
    test("should remain CLOSED after successful operations", () => {
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    test("should transition to OPEN after reaching failure threshold", () => {
      // Default threshold is 5 failures
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      circuitBreaker.recordFailure(); // 5th failure

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "Circuit breaker OPEN - too many failures (5)"
      );
    });

    test("should reset failure count on success", () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess(); // Reset counter

      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("OPEN state behavior", () => {
    beforeEach(() => {
      // Transition to OPEN state
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      vi.clearAllMocks();
    });

    test("should reject execution when OPEN", () => {
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    test("should remain OPEN before timeout expires", () => {
      // Timeout is 60000ms, so immediate check should still be OPEN
      expect(circuitBreaker.canExecute()).toBe(false);
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    test("should transition to HALF_OPEN after timeout", () => {
      vi.useFakeTimers();

      expect(circuitBreaker.canExecute()).toBe(false);

      // Fast-forward 60 seconds
      vi.advanceTimersByTime(60000);

      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Circuit breaker HALF_OPEN - testing recovery"
      );

      vi.useRealTimers();
    });
  });

  describe("HALF_OPEN state behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers();

      // Transition to OPEN state
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      // Wait for timeout to transition to HALF_OPEN
      vi.advanceTimersByTime(60000);
      circuitBreaker.canExecute();

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("should allow execution in HALF_OPEN state", () => {
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    test("should transition to CLOSED after success threshold", () => {
      // Default success threshold is 2
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      circuitBreaker.recordSuccess(); // 2nd success

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Circuit breaker CLOSED - service recovered"
      );
    });

    test("should transition back to OPEN on failure", () => {
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "Circuit breaker OPEN - recovery failed"
      );
    });

    test("should not accumulate success count after transitioning to CLOSED", () => {
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess(); // Transitions to CLOSED

      // Now in CLOSED state, more successes shouldn't affect anything
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("State transitions", () => {
    test("complete cycle: CLOSED → OPEN → HALF_OPEN → CLOSED", () => {
      vi.useFakeTimers();

      // Start in CLOSED
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      // Trigger 5 failures to OPEN
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout to HALF_OPEN
      vi.advanceTimersByTime(60000);
      circuitBreaker.canExecute();
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // 2 successes to CLOSED
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      vi.useRealTimers();
    });

    test("complete cycle: CLOSED → OPEN → HALF_OPEN → OPEN", () => {
      vi.useFakeTimers();

      // Start in CLOSED
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      // Trigger 5 failures to OPEN
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout to HALF_OPEN
      vi.advanceTimersByTime(60000);
      circuitBreaker.canExecute();
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Failure returns to OPEN
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      vi.useRealTimers();
    });
  });

  describe("Edge cases", () => {
    test("should handle success in CLOSED state without issues", () => {
      // Multiple successes in CLOSED shouldn't cause problems
      for (let i = 0; i < 10; i++) {
        circuitBreaker.recordSuccess();
      }
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test("should handle partial success in HALF_OPEN", () => {
      vi.useFakeTimers();

      // Get to HALF_OPEN
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      vi.advanceTimersByTime(60000);
      circuitBreaker.canExecute();

      // One success (need 2 for CLOSED)
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Then failure before reaching threshold
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      vi.useRealTimers();
    });
  });
});
