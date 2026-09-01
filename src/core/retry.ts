// SPDX-License-Identifier: MIT

// Only the fields retry logic owns; circuitBreakerTrips lives in the
// composed ApiMetrics (#src/config/types) instead.
export interface RetryMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retries: number;
  rateLimitHits: number;
}

export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export interface HttpError extends Error {
  status?: number;
  response?: { headers?: { "retry-after"?: string } };
}

export function recordAttempt(metrics: RetryMetrics): RetryMetrics {
  return { ...metrics, totalRequests: metrics.totalRequests + 1 };
}

export function recordSuccess(metrics: RetryMetrics): RetryMetrics {
  return { ...metrics, successfulRequests: metrics.successfulRequests + 1 };
}

export function recordRateLimitHit(metrics: RetryMetrics): RetryMetrics {
  return { ...metrics, rateLimitHits: metrics.rateLimitHits + 1 };
}

export function recordRetryScheduled(metrics: RetryMetrics): RetryMetrics {
  return { ...metrics, retries: metrics.retries + 1 };
}

export function recordRequestFailed(metrics: RetryMetrics): RetryMetrics {
  return { ...metrics, failedRequests: metrics.failedRequests + 1 };
}

// Narrows an unknown catch value into an HttpError without altering its
// shape. Object-shaped rejections (Error instances or plain objects) are
// passed through untouched so callers keep reading whatever optional
// properties they carry. Only genuine non-object primitives (a thrown
// string, number, etc.) are wrapped in a real Error.
export function toHttpError(error: unknown): HttpError {
  if (typeof error === "object" && error !== null) {
    return error as HttpError;
  }
  return new Error(String(error));
}

export function isRateLimitError(error: HttpError): boolean {
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

export function isClientError(error: HttpError): boolean {
  return (
    !!error.status &&
    error.status >= HTTP_STATUS.BAD_REQUEST &&
    error.status < HTTP_STATUS.INTERNAL_SERVER_ERROR
  );
}
