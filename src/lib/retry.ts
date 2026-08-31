// SPDX-License-Identifier: MIT
import { API_CONFIG, HTTP_STATUS } from "#src/config/constants";
import type {
  ApiMetrics,
  CircuitBreakerHandle,
  RetryDeps,
} from "#src/config/types";
import {
  type HttpError,
  isClientError,
  isRateLimitError,
  recordAttempt,
  recordRateLimitHit,
  recordRequestFailed,
  recordRetryScheduled,
  recordSuccess,
  toHttpError,
} from "#src/core/retry";
import * as logger from "./logger";

// Merges a pure record* function's returned patch back onto the caller's
// live metrics object. Every call site needs the same two-step "compute
// purely, then merge onto the shared object" dance, since the pure functions
// in #src/core/retry never mutate their input; factoring it out here also
// removes the chance of a call site assigning the result to a new local
// instead of merging it, which would silently drop the update.
function apply(
  metrics: ApiMetrics,
  fn: (metrics: ApiMetrics) => ApiMetrics
): void {
  Object.assign(metrics, fn(metrics));
}

// Bundles the pure metrics update with the effectful circuit-breaker call so
// every call site that gives up on an operation records both signals
// together, instead of relying on callers to remember both steps.
function recordFailure(
  metrics: ApiMetrics,
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
    metrics: ApiMetrics
  ): Promise<void> {
    apply(metrics, recordRateLimitHit);
    const retryAfter = error.response?.headers?.["retry-after"];
    const waitTime = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : API_CONFIG.DEFAULT_RATE_LIMIT_WAIT_MS;
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
    metrics: ApiMetrics
  ): Promise<void> {
    const delay = Math.min(
      API_CONFIG.INITIAL_RETRY_DELAY_MS * 2 ** attempt,
      API_CONFIG.MAX_RETRY_DELAY_MS
    );
    logger.warn(
      `${operationName} failed (attempt ${attempt + 1}/${
        API_CONFIG.MAX_RETRIES + 1
      }), retrying in ${delay}ms: ${error.message}`
    );
    await sleep(delay);
    apply(metrics, recordRetryScheduled);
  }

  // Shell around the pure classification and metrics functions from
  // #src/core/retry: it owns the actual attempt loop, the sleeping between
  // attempts, and the effectful circuitBreaker/logger calls that the pure
  // functions deliberately don't perform.
  return async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    metrics: ApiMetrics,
    circuitBreaker: CircuitBreakerHandle
  ): Promise<T> {
    let lastError: HttpError | null = null;

    for (let attempt = 0; attempt <= API_CONFIG.MAX_RETRIES; attempt++) {
      try {
        apply(metrics, recordAttempt);
        const result = await operation();
        apply(metrics, recordSuccess);
        circuitBreaker.recordSuccess();
        return result;
      } catch (err) {
        lastError = toHttpError(err);

        if (isRateLimitError(lastError)) {
          await handleRateLimitError(lastError, operationName, metrics);
          if (attempt === API_CONFIG.MAX_RETRIES) {
            recordFailure(metrics, circuitBreaker);
          }
          continue;
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

        if (attempt < API_CONFIG.MAX_RETRIES) {
          await handleRetryableError(
            lastError,
            operationName,
            attempt,
            metrics
          );
        } else {
          recordFailure(metrics, circuitBreaker);
        }
      }
    }

    throw lastError;
  };
}
