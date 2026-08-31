// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { HTTP_STATUS } from "#src/config/constants";
import type { ApiMetrics } from "#src/config/types";
import type { HttpError } from "#src/core/retry";
import {
  isClientError,
  isRateLimitError,
  recordAttempt,
  recordRateLimitHit,
  recordRequestFailed,
  recordRetryScheduled,
  recordSuccess,
  toHttpError,
} from "#src/core/retry";

function zeroMetrics(): ApiMetrics {
  return {
    totalRequests: 0,
    successfulRequests: 0,
    rateLimitHits: 0,
    retries: 0,
    failedRequests: 0,
  };
}

const ALL_FIELDS: (keyof ApiMetrics)[] = [
  "totalRequests",
  "successfulRequests",
  "rateLimitHits",
  "retries",
  "failedRequests",
];

describe.each([
  { name: "recordAttempt", fn: recordAttempt, field: "totalRequests" },
  { name: "recordSuccess", fn: recordSuccess, field: "successfulRequests" },
  {
    name: "recordRateLimitHit",
    fn: recordRateLimitHit,
    field: "rateLimitHits",
  },
  { name: "recordRetryScheduled", fn: recordRetryScheduled, field: "retries" },
  {
    name: "recordRequestFailed",
    fn: recordRequestFailed,
    field: "failedRequests",
  },
])("$name", ({ fn, field }) => {
  it(`increments only ${field} by 1 and leaves every other field untouched`, () => {
    // Arrange
    const metrics = zeroMetrics();

    // Act
    const result = fn(metrics);

    // Assert
    expect(result[field as keyof ApiMetrics]).toBe(1);
    for (const other of ALL_FIELDS) {
      if (other !== field) {
        expect(result[other]).toBe(0);
      }
    }
  });

  it("increments cumulatively when called twice", () => {
    // Arrange
    const metrics = zeroMetrics();

    // Act
    const once = fn(metrics);
    const twice = fn(once);

    // Assert
    expect(twice[field as keyof ApiMetrics]).toBe(2);
  });

  it("does not mutate the input object", () => {
    // Arrange
    const metrics = zeroMetrics();

    // Act
    fn(metrics);

    // Assert
    for (const other of ALL_FIELDS) {
      expect(metrics[other]).toBe(0);
    }
  });
});

describe("isRateLimitError", () => {
  it("returns true for a 429 status", () => {
    // Arrange
    const error = { status: HTTP_STATUS.TOO_MANY_REQUESTS } as HttpError;

    // Act
    const result = isRateLimitError(error);

    // Assert
    expect(result).toBe(true);
  });

  it("returns true for a 403 with a retry-after header", () => {
    // Arrange
    const error = {
      status: HTTP_STATUS.FORBIDDEN,
      response: { headers: { "retry-after": "30" } },
    } as HttpError;

    // Act
    const result = isRateLimitError(error);

    // Assert
    expect(result).toBe(true);
  });

  it("returns false for a bare 403 with no retry-after header", () => {
    // Arrange
    const error = { status: HTTP_STATUS.FORBIDDEN } as HttpError;

    // Act
    const result = isRateLimitError(error);

    // Assert
    expect(result).toBe(false);
  });

  it("returns true when the message contains 'rate limit' with no matching status", () => {
    // Arrange
    const error = { message: "rate limit exceeded" } as HttpError;

    // Act
    const result = isRateLimitError(error);

    // Assert
    expect(result).toBe(true);
  });

  it("returns false for a plain error", () => {
    // Arrange
    const error = { message: "boom" } as HttpError;

    // Act
    const result = isRateLimitError(error);

    // Assert
    expect(result).toBe(false);
  });
});

describe("isClientError", () => {
  it.each([
    { label: "400", status: HTTP_STATUS.BAD_REQUEST },
    { label: "429", status: HTTP_STATUS.TOO_MANY_REQUESTS },
    { label: "499", status: 499 },
  ])("returns true for status $label", ({ status }) => {
    // Arrange
    const error = { status } as HttpError;

    // Act
    const result = isClientError(error);

    // Assert
    expect(result).toBe(true);
  });

  it("returns false for a 500 status", () => {
    // Arrange
    const error = { status: HTTP_STATUS.INTERNAL_SERVER_ERROR } as HttpError;

    // Act
    const result = isClientError(error);

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when there is no status", () => {
    // Arrange
    const error = {} as HttpError;

    // Act
    const result = isClientError(error);

    // Assert
    expect(result).toBe(false);
  });
});

describe("toHttpError", () => {
  it("passes an Error instance through untouched", () => {
    // Arrange
    const error = new Error("original");

    // Act
    const result = toHttpError(error);

    // Assert
    expect(result).toBe(error);
  });

  it("passes a plain object with a status field through untouched (cast, not copied)", () => {
    // Arrange
    const error = { status: 418, message: "teapot" };

    // Act
    const result = toHttpError(error);

    // Assert
    expect(result).toBe(error);
  });

  it("wraps a thrown string into a new Error with that string as message", () => {
    // Arrange
    const thrown = "plain string failure";

    // Act
    const result = toHttpError(thrown);

    // Assert
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe(thrown);
  });

  it('wraps null into a new Error("null")', () => {
    // Arrange
    const thrown = null;

    // Act
    const result = toHttpError(thrown);

    // Assert
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("null");
  });
});
