// SPDX-License-Identifier: MIT
import type { WorkflowRun } from "../config/types";

export interface MakeWorkflowRunsOptions {
  /** Total number of runs to generate. */
  count: number;
  /** Number of distinct workflow IDs to round-robin across. Defaults to 1. */
  workflowIdCount?: number;
  /** Timestamp (or Date) for the earliest generated run. Defaults to now. */
  startDate?: string | Date;
  /** Milliseconds between each successive run's created_at. Defaults to 1 hour. */
  intervalMs?: number;
}

/**
 * Generates synthetic WorkflowRun objects for stress/E2E tests, distributing
 * them round-robin across the configured number of workflow IDs with
 * created_at spread across the configured range. Returns a fresh array on
 * every call: no module-level caching or shared mutable state, so callers
 * can freely mutate or reuse results across test cases without interference.
 */
export function makeWorkflowRuns(
  options: MakeWorkflowRunsOptions
): WorkflowRun[] {
  const {
    count,
    workflowIdCount = 1,
    startDate = new Date(),
    intervalMs = 60 * 60 * 1000,
  } = options;

  const startMs = new Date(startDate).getTime();

  return Array.from({ length: count }, (_, index) => {
    const workflowId = 100 + (index % workflowIdCount);
    return {
      id: index + 1,
      workflow_id: workflowId,
      created_at: new Date(startMs + index * intervalMs).toISOString(),
      name: `workflow-${workflowId}`,
    };
  });
}

/**
 * Builds an error mirroring Octokit's real RequestError shape: the
 * `status` and `response.headers['retry-after']` fields that
 * src/lib/retry.ts reads to classify and time retries. Mirrors the
 * `makeHttpError` helper established in src/lib/retry.test.ts.
 */
export function makeHttpError(
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

export type FailureOutcome = "success" | { status: number; retryAfter?: string };

/**
 * Creates a stateful, scriptable outcome generator for driving retry and
 * circuit-breaker logic through repeated simulated calls (e.g. "fail the
 * first N calls with status X, then succeed"). Each call to the returned
 * function consumes the next outcome from `script`; once the script is
 * exhausted, its final outcome repeats for every subsequent call. Keeps
 * just enough state (a call counter) for the sustained-failure,
 * intermittent-failure, and Nth-call-failure stress scenarios.
 */
export function makeFailureInjector(
  script: FailureOutcome[]
): () => Promise<object> {
  let callIndex = 0;

  return function nextCall(): Promise<object> {
    const outcome = script[Math.min(callIndex, script.length - 1)];
    callIndex++;
    if (outcome === "success") {
      return Promise.resolve({});
    }
    return Promise.reject(
      makeHttpError(`injected failure (status ${outcome.status})`, outcome)
    );
  };
}
