// SPDX-License-Identifier: MIT
import { API_CONFIG, HTTP_STATUS } from "../config/constants";
import type {
  ApiMetrics,
  CircuitBreakerHandle,
  RetryDeps,
} from "../config/types";
import * as logger from "./logger";

interface HttpError extends Error {
  status?: number;
  response?: { headers?: { "retry-after"?: string } };
}

function isRateLimitError(error: HttpError): boolean {
  if (error.status === HTTP_STATUS.TOO_MANY_REQUESTS) return true;
  if (error.message?.includes("rate limit")) return true;
  // A 403 is only treated as a rate limit when it carries a Retry-After
  // header, GitHub's signal for a secondary rate limit. A bare 403 with
  // no such header is a permissions error and should fail fast instead
  // of being retried for up to four minutes (see handleRateLimitError's
  // default wait).
  return (
    error.status === HTTP_STATUS.FORBIDDEN &&
    !!error.response?.headers?.["retry-after"]
  );
}

function isClientError(error: HttpError): boolean {
  return (
    !!error.status &&
    error.status >= HTTP_STATUS.BAD_REQUEST &&
    error.status < HTTP_STATUS.INTERNAL_SERVER_ERROR
  );
}

export function makeRetry(deps: RetryDeps) {
  const { sleep } = deps;

  async function handleRateLimitError(
    error: HttpError,
    operationName: string,
    metrics: ApiMetrics
  ): Promise<void> {
    metrics.rateLimitHits++;
    const retryAfter = error.response?.headers?.["retry-after"];
    const waitTime = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : API_CONFIG.DEFAULT_RATE_LIMIT_WAIT_MS;
    logger.warn(`Rate limit hit for ${operationName}, waiting ${waitTime}ms`);
    await sleep(waitTime);
    metrics.retries++;
  }

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
    metrics.retries++;
  }

  return async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    metrics: ApiMetrics,
    circuitBreaker: CircuitBreakerHandle
  ): Promise<T> {
    let lastError: HttpError | null = null;

    for (let attempt = 0; attempt <= API_CONFIG.MAX_RETRIES; attempt++) {
      try {
        metrics.totalRequests++;
        const result = await operation();
        metrics.successfulRequests++;
        circuitBreaker.recordSuccess();
        return result;
      } catch (err) {
        lastError = err as HttpError;

        if (isRateLimitError(lastError)) {
          await handleRateLimitError(lastError, operationName, metrics);
          continue;
        }

        if (isClientError(lastError)) {
          metrics.failedRequests++;
          circuitBreaker.recordFailure();
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
          metrics.failedRequests++;
          circuitBreaker.recordFailure();
        }
      }
    }

    throw lastError;
  };
}
