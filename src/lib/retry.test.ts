// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import type { ApiMetrics, CircuitBreakerHandle } from "../config/types";
import { makeRetry } from "./retry";

function makeMetrics(): ApiMetrics {
  return {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retries: 0,
    rateLimitHits: 0,
    circuitBreakerTrips: 0,
  };
}

function makeCircuitBreaker(): CircuitBreakerHandle & {
  recordSuccess: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
} {
  return {
    canExecute: vi.fn().mockReturnValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    getState: vi.fn(),
  };
}

function makeHttpError(
  message: string,
  opts: { status?: number; retryAfter?: string } = {}
): Error & {
  status?: number;
  response?: { headers?: Record<string, string> };
} {
  const error: Error & {
    status?: number;
    response?: { headers?: Record<string, string> };
  } = new Error(message);
  error.status = opts.status;
  if (opts.retryAfter !== undefined) {
    error.response = { headers: { "retry-after": opts.retryAfter } };
  }
  return error;
}

describe("retry", () => {
  describe("withRetry", () => {
    it("should succeed on the first attempt without sleeping", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi.fn().mockResolvedValue("ok");

      const result = await withRetry(operation, "op", metrics, circuitBreaker);

      expect(result).toBe("ok");
      expect(sleep).not.toHaveBeenCalled();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.retries).toBe(0);
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledTimes(1);
    });

    it("should retry a 5xx error with exponential backoff and then succeed", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(makeHttpError("server error", { status: 500 }))
        .mockResolvedValueOnce("ok");

      const result = await withRetry(operation, "op", metrics, circuitBreaker);

      expect(result).toBe("ok");
      expect(sleep).toHaveBeenCalledWith(1000);
      expect(metrics.retries).toBe(1);
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(1);
    });

    it("should back off exponentially across successive retryable failures", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(makeHttpError("server error", { status: 500 }))
        .mockRejectedValueOnce(makeHttpError("server error", { status: 500 }))
        .mockResolvedValueOnce("ok");

      await withRetry(operation, "op", metrics, circuitBreaker);

      expect(sleep).toHaveBeenNthCalledWith(1, 1000);
      expect(sleep).toHaveBeenNthCalledWith(2, 2000);
      expect(metrics.retries).toBe(2);
    });

    it("should wait for the Retry-After header duration on a 429", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(
          makeHttpError("rate limited", { status: 429, retryAfter: "2" })
        )
        .mockResolvedValueOnce("ok");

      await withRetry(operation, "op", metrics, circuitBreaker);

      expect(sleep).toHaveBeenCalledWith(2000);
      expect(metrics.rateLimitHits).toBe(1);
      expect(metrics.retries).toBe(1);
    });

    it("should fall back to the default rate-limit wait when no Retry-After header is present", async () => {
      // Regression test for the previously uncovered branch (retry.ts BRDA:40,2,1,0):
      // a 429/403 with no retry-after header must fall through to the default wait.
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(makeHttpError("rate limited", { status: 429 }))
        .mockResolvedValueOnce("ok");

      await withRetry(operation, "op", metrics, circuitBreaker);

      expect(sleep).toHaveBeenCalledWith(60000);
      expect(metrics.rateLimitHits).toBe(1);
    });

    it("should fail fast on a 4xx client error without retrying", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const error = makeHttpError("bad request", { status: 400 });
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withRetry(operation, "op", metrics, circuitBreaker)
      ).rejects.toThrow("bad request");

      expect(sleep).not.toHaveBeenCalled();
      expect(operation).toHaveBeenCalledTimes(1);
      expect(metrics.failedRequests).toBe(1);
      expect(circuitBreaker.recordFailure).toHaveBeenCalledTimes(1);
    });

    it("should fail fast on a bare 403 (no Retry-After) instead of treating it as a rate limit", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const error = makeHttpError("Resource not accessible by integration", {
        status: 403,
      });
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withRetry(operation, "op", metrics, circuitBreaker)
      ).rejects.toThrow(/actions: write/);

      expect(sleep).not.toHaveBeenCalled();
      expect(operation).toHaveBeenCalledTimes(1);
      expect(metrics.rateLimitHits).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(circuitBreaker.recordFailure).toHaveBeenCalledTimes(1);
    });

    it("should still treat a 403 with a Retry-After header as a rate limit", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(
          makeHttpError("secondary rate limit", {
            status: 403,
            retryAfter: "3",
          })
        )
        .mockResolvedValueOnce("ok");

      await withRetry(operation, "op", metrics, circuitBreaker);

      expect(sleep).toHaveBeenCalledWith(3000);
      expect(metrics.rateLimitHits).toBe(1);
      expect(circuitBreaker.recordFailure).not.toHaveBeenCalled();
    });

    it("should throw the last error and record a failure once retries are exhausted", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const error = makeHttpError("server error", { status: 500 });
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withRetry(operation, "op", metrics, circuitBreaker)
      ).rejects.toThrow("server error");

      // MAX_RETRIES = 3, so the loop runs attempts 0..3 (4 total calls).
      expect(operation).toHaveBeenCalledTimes(4);
      expect(metrics.failedRequests).toBe(1);
      expect(circuitBreaker.recordFailure).toHaveBeenCalledTimes(1);
    });

    it("should record a failure when rate limiting persists through every retry", async () => {
      // Regression test: a rate limit on the final attempt used to sleep and
      // continue straight into `throw lastError` without ever incrementing
      // failedRequests or calling circuitBreaker.recordFailure().
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const error = makeHttpError("rate limited", {
        status: 429,
        retryAfter: "1",
      });
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withRetry(operation, "op", metrics, circuitBreaker)
      ).rejects.toThrow("rate limited");

      expect(operation).toHaveBeenCalledTimes(4);
      expect(metrics.rateLimitHits).toBe(4);
      expect(metrics.failedRequests).toBe(1);
      expect(circuitBreaker.recordFailure).toHaveBeenCalledTimes(1);
    });

    it("should classify a message containing 'rate limit' as a rate limit even without a matching status", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error("secondary rate limit exceeded"))
        .mockResolvedValueOnce("ok");

      await withRetry(operation, "op", metrics, circuitBreaker);

      expect(metrics.rateLimitHits).toBe(1);
      expect(sleep).toHaveBeenCalledWith(60000);
    });
  });
});
