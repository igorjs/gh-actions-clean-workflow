// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import type { ApiMetrics, CircuitBreakerHandle } from "../config/types";
import { makeHttpError } from "./api.test-helpers";
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

    it("should back off exponentially across three retryable 5xx failures before succeeding", async () => {
      // Pins handleRetryableError's Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt,
      // MAX_RETRY_DELAY_MS) across a longer run than the 2-failure case above,
      // staying within MAX_RETRIES=3 so the operation still succeeds.
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(makeHttpError("server error", { status: 500 }))
        .mockRejectedValueOnce(makeHttpError("server error", { status: 500 }))
        .mockRejectedValueOnce(makeHttpError("server error", { status: 500 }))
        .mockResolvedValueOnce("ok");

      const result = await withRetry(operation, "op", metrics, circuitBreaker);

      expect(result).toBe("ok");
      expect(sleep).toHaveBeenNthCalledWith(1, 1000);
      expect(sleep).toHaveBeenNthCalledWith(2, 2000);
      expect(sleep).toHaveBeenNthCalledWith(3, 4000);
      expect(metrics.retries).toBe(3);
      expect(metrics.totalRequests).toBe(4);
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

    it("should compute exact backoff ms for a sustained run of 429s with distinct Retry-After values", async () => {
      // Pins handleRateLimitError's `parseInt(retryAfter, 10) * 1000`
      // computation across a run of consecutive rate limits with different
      // header values, not just the single-occurrence case above.
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(
          makeHttpError("rate limited", { status: 429, retryAfter: "1" })
        )
        .mockRejectedValueOnce(
          makeHttpError("rate limited", { status: 429, retryAfter: "3" })
        )
        .mockRejectedValueOnce(
          makeHttpError("rate limited", { status: 429, retryAfter: "5" })
        )
        .mockResolvedValueOnce("ok");

      const result = await withRetry(operation, "op", metrics, circuitBreaker);

      expect(result).toBe("ok");
      expect(sleep).toHaveBeenNthCalledWith(1, 1000);
      expect(sleep).toHaveBeenNthCalledWith(2, 3000);
      expect(sleep).toHaveBeenNthCalledWith(3, 5000);
      expect(metrics.rateLimitHits).toBe(3);
      expect(metrics.retries).toBe(3);
    });

    it("should fall back to the default rate-limit wait on every retry of a sustained 429 run with no Retry-After header", async () => {
      // Pins handleRateLimitError's DEFAULT_RATE_LIMIT_WAIT_MS fallback across
      // repeated occurrences, not just the single-occurrence case above.
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(makeHttpError("rate limited", { status: 429 }))
        .mockRejectedValueOnce(makeHttpError("rate limited", { status: 429 }))
        .mockRejectedValueOnce(makeHttpError("rate limited", { status: 429 }))
        .mockResolvedValueOnce("ok");

      const result = await withRetry(operation, "op", metrics, circuitBreaker);

      expect(result).toBe("ok");
      expect(sleep).toHaveBeenNthCalledWith(1, 60000);
      expect(sleep).toHaveBeenNthCalledWith(2, 60000);
      expect(sleep).toHaveBeenNthCalledWith(3, 60000);
      expect(metrics.rateLimitHits).toBe(3);
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
      // Pins isRateLimitError's exact gate (retry.ts:36-38):
      // `error.status === HTTP_STATUS.FORBIDDEN && !!error.response?.headers?.["retry-after"]`.
      // A bare 403 with no retry-after header fails the gate and must NOT be
      // retried, distinct from the 403+Retry-After case below which IS.
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

    it("should exhaust retries and record exactly one failure across mixed 5xx error types", async () => {
      // Distinct from the single-error-type exhaustion test above: alternates
      // 500/502/503 across all MAX_RETRIES + 1 = 4 attempts, confirming
      // recordFailure still fires exactly once regardless of how many
      // distinct retryable error types were seen along the way.
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi
        .fn()
        .mockRejectedValueOnce(makeHttpError("server error", { status: 500 }))
        .mockRejectedValueOnce(makeHttpError("bad gateway", { status: 502 }))
        .mockRejectedValueOnce(
          makeHttpError("service unavailable", { status: 503 })
        )
        .mockRejectedValueOnce(makeHttpError("server error", { status: 500 }));

      await expect(
        withRetry(operation, "op", metrics, circuitBreaker)
      ).rejects.toThrow("server error");

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

    it("should wrap a non-error thrown value into an Error before classifying it", async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const withRetry = makeRetry({ sleep });
      const metrics = makeMetrics();
      const circuitBreaker = makeCircuitBreaker();
      const operation = vi.fn().mockRejectedValue("boom");

      await expect(
        withRetry(operation, "op", metrics, circuitBreaker)
      ).rejects.toThrow("boom");

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
