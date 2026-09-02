// SPDX-License-Identifier: MIT

import {
  HTTP_STATUS,
  type HttpError,
  isClientError,
  isRateLimitError,
  type RetryMetrics,
  recordAttempt,
  recordRateLimitHit,
  recordRequestFailed,
  recordRetryScheduled,
  recordSuccess,
  toHttpError,
} from "#src/core/retry";
import type { Sleep } from "#src/types";
import type { CircuitBreakerHandle } from "./circuit-breaker";
import * as logger from "./logger";

export type RetryDeps = {
  sleep: Sleep;
};

export const RETRY_CONFIG = {
  /** Maximum retries for failed requests */
  MAX_RETRIES: 3,
  /** Initial retry delay in ms */
  INITIAL_RETRY_DELAY_MS: 1000,
  /** Maximum retry delay in ms */
  MAX_RETRY_DELAY_MS: 32000,
  /** Default rate limit wait time in ms when no retry-after header */
  DEFAULT_RATE_LIMIT_WAIT_MS: 60000,
} as const;

// Merges a pure record* function's returned patch back onto the caller's
// live metrics object. Every call site needs the same two-step "compute
// purely, then merge onto the shared object" dance, since the pure functions
// in #src/core/retry never mutate their input; factoring it out here also
// removes the chance of a call site assigning the result to a new local
// instead of merging it, which would silently drop the update.
function apply(
  metrics: RetryMetrics,
  fn: (metrics: RetryMetrics) => RetryMetrics
): void {
  Object.assign(metrics, fn(metrics));
}

// Bundles the pure metrics update with the effectful circuit-breaker call so
// every call site that gives up on an operation records both signals
// together, instead of relying on callers to remember both steps.
function recordFailure(
  metrics: RetryMetrics,
  circuitBreaker: CircuitBreakerHandle
): void {
  apply(metrics, recordRequestFailed);
  circuitBreaker.recordFailure();
}

export function makeRetry(deps: RetryDeps) {
  const { sleep } = deps;

  // Rate-limit hits and the retry they trigger are recorded as two separate
  // metrics (rateLimitHits, retries) because a caller may want to know how
  // often GitHub throttled requests independently of how many retries that
  // caused overall.
  async function handleRateLimitError(
    error: HttpError,
    operationName: string,
    metrics: RetryMetrics
  ): Promise<void> {
    apply(metrics, recordRateLimitHit);
    const retryAfter = error.response?.headers?.["retry-after"];
    const parsedRetryAfter = retryAfter ? parseInt(retryAfter, 10) : NaN;
    // GitHub controls this header, but guard against a malformed value
    // (e.g. non-numeric) turning into a NaN-derived near-zero-delay sleep
    // instead of a safe fallback wait.
    const waitTime = Number.isFinite(parsedRetryAfter)
      ? parsedRetryAfter * 1000
      : RETRY_CONFIG.DEFAULT_RATE_LIMIT_WAIT_MS;
    logger.warn(`Rate limit hit for ${operationName}, waiting ${waitTime}ms`);
    await sleep(waitTime);
    apply(metrics, recordRetryScheduled);
  }

  // Exponential backoff capped at MAX_RETRY_DELAY_MS so a long run of
  // failures doesn't grow the wait unbounded while attempt keeps increasing.
  async function handleRetryableError(
    error: HttpError,
    operationName: string,
    attempt: number,
    metrics: RetryMetrics
  ): Promise<void> {
    const delay = Math.min(
      RETRY_CONFIG.INITIAL_RETRY_DELAY_MS * 2 ** attempt,
      RETRY_CONFIG.MAX_RETRY_DELAY_MS
    );
    logger.warn(
      `${operationName} failed (attempt ${attempt + 1}/${
        RETRY_CONFIG.MAX_RETRIES + 1
      }), retrying in ${delay}ms: ${error.message}`
    );
    await sleep(delay);
    apply(metrics, recordRetryScheduled);
  }

  // Shell around the pure classification and metrics functions from
  // #src/core/retry: it owns the actual attempt sequence, the sleeping
  // between attempts, and the effectful circuitBreaker/logger calls that the
  // pure functions deliberately don't perform. Expressed as a recursive
  // attempt() rather than a for-loop with continue/break: each branch's
  // "retry or give up" decision is then a direct return/throw instead of
  // relying on loop fallthrough and a post-loop `throw lastError`.
  return async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    metrics: RetryMetrics,
    circuitBreaker: CircuitBreakerHandle
  ): Promise<T> {
    async function attempt(attemptNum: number): Promise<T> {
      try {
        apply(metrics, recordAttempt);
        const result = await operation();
        apply(metrics, recordSuccess);
        circuitBreaker.recordSuccess();
        return result;
      } catch (err) {
        const lastError = toHttpError(err);

        if (isRateLimitError(lastError)) {
          await handleRateLimitError(lastError, operationName, metrics);
          if (attemptNum === RETRY_CONFIG.MAX_RETRIES) {
            recordFailure(metrics, circuitBreaker);
            throw lastError;
          }
          return attempt(attemptNum + 1);
        }

        if (isClientError(lastError)) {
          recordFailure(metrics, circuitBreaker);
          // A bare 403 (already ruled out as a rate limit above) is almost
          // always a missing-scope token rather than a transient failure, so
          // point the caller at the fix instead of leaving them to guess.
          if (lastError.status === HTTP_STATUS.FORBIDDEN) {
            lastError.message = `${lastError.message} (if this is a permissions error, ensure the token has 'actions: write' scope on the target repository)`;
          }
          throw lastError;
        }

        if (attemptNum < RETRY_CONFIG.MAX_RETRIES) {
          await handleRetryableError(
            lastError,
            operationName,
            attemptNum,
            metrics
          );
          return attempt(attemptNum + 1);
        }

        recordFailure(metrics, circuitBreaker);
        throw lastError;
      }
    }

    return attempt(0);
  };
}
