// SPDX-License-Identifier: MIT
import { HTTP_STATUS } from "#src/config/constants";
import type { ApiMetrics } from "#src/config/types";

export interface HttpError extends Error {
  status?: number;
  response?: { headers?: { "retry-after"?: string } };
}

// Pure counterparts to the inline mutations `withRetry` in `src/lib/retry.ts`
// applies directly to its `metrics` object (e.g. `metrics.totalRequests++`).
// Each function below returns a NEW ApiMetrics with exactly its own field
// incremented, leaving the input untouched, so metric updates can be
// composed and tested without a shared mutable object.
export function recordAttempt(metrics: ApiMetrics): ApiMetrics {
  return { ...metrics, totalRequests: metrics.totalRequests + 1 };
}

export function recordSuccess(metrics: ApiMetrics): ApiMetrics {
  return { ...metrics, successfulRequests: metrics.successfulRequests + 1 };
}

export function recordRateLimitHit(metrics: ApiMetrics): ApiMetrics {
  return { ...metrics, rateLimitHits: metrics.rateLimitHits + 1 };
}

export function recordRetryScheduled(metrics: ApiMetrics): ApiMetrics {
  return { ...metrics, retries: metrics.retries + 1 };
}

export function recordRequestFailed(metrics: ApiMetrics): ApiMetrics {
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
