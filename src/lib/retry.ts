/**
 * Retry logic with exponential backoff and rate limit handling
 */

import { setTimeout } from "node:timers/promises";
import { API_CONFIG, HTTP_STATUS } from "../config/constants";
import type { ApiMetrics } from "../config/types";
import type { CircuitBreaker } from "./circuit-breaker";
import * as logger from "./logger";

/**
 * Error with HTTP status code
 */
interface HttpError extends Error {
  status?: number;
  response?: {
    headers?: {
      "retry-after"?: string;
    };
  };
}

/**
 * Executes an operation with retry logic and exponential backoff
 *
 * Retry behavior:
 * - Rate limit errors (429, 403): Honors retry-after header
 * - Server errors (5xx): Exponential backoff
 * - Client errors (4xx except 429): No retry
 * - Network errors: Exponential backoff
 *
 * @param operation - Async function to execute
 * @param operationName - Name for logging purposes
 * @param metrics - Metrics object to update
 * @param circuitBreaker - Circuit breaker to record results
 * @returns Result of the operation
 * @throws Last error if all retries fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  metrics: ApiMetrics,
  circuitBreaker: CircuitBreaker
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

      // Check if this is a rate limit error
      if (isRateLimitError(lastError)) {
        await handleRateLimitError(lastError, operationName, metrics);
        continue;
      }

      // Don't retry on client errors (except rate limit)
      if (isClientError(lastError)) {
        metrics.failedRequests++;
        circuitBreaker.recordFailure();
        throw lastError;
      }

      // Retry on server errors (5xx) and network errors
      if (attempt < API_CONFIG.MAX_RETRIES) {
        await handleRetryableError(lastError, operationName, attempt, metrics);
      } else {
        metrics.failedRequests++;
        circuitBreaker.recordFailure();
      }
    }
  }

  throw lastError;
}

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error: HttpError): boolean {
  return (
    error.status === HTTP_STATUS.TOO_MANY_REQUESTS ||
    error.status === HTTP_STATUS.FORBIDDEN ||
    error.message?.includes("rate limit")
  );
}

/**
 * Check if error is a client error (4xx except 429)
 */
function isClientError(error: HttpError): boolean {
  return (
    !!error.status &&
    error.status >= HTTP_STATUS.BAD_REQUEST &&
    error.status < HTTP_STATUS.INTERNAL_SERVER_ERROR
  );
}

/**
 * Handle rate limit error by waiting for the appropriate time
 */
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
  await setTimeout(waitTime);
  metrics.retries++;
}

/**
 * Handle retryable error with exponential backoff
 */
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

  await setTimeout(delay);
  metrics.retries++;
}
