/**
 * Type definitions for the application
 */

import type { CircuitState } from "./constants";

/**
 * Represents a GitHub workflow run
 */
export interface WorkflowRun {
  /** Unique identifier for the run */
  id: number;
  /** ID of the workflow this run belongs to */
  workflow_id: number;
  /** ISO 8601 timestamp when the run was created */
  created_at: string;
  /** Name of the workflow */
  name: string;
}

/**
 * Parameters for initializing the API client
 */
export interface ApiParams {
  /** GitHub personal access token */
  token: string;
  /** Repository owner (username or organization) */
  owner: string;
  /** Repository name */
  repo: string;
  /** Whether to run in dry-run mode (no actual deletions) */
  dryRun?: boolean;
  /** Filter by workflow names - if provided, only delete runs from these workflows */
  workflowNames?: string[];
}

/**
 * Statistics for a specific workflow
 */
export interface WorkflowStats {
  /** Total number of runs for this workflow */
  total: number;
  /** Number of runs marked for deletion */
  toDelete: number;
}

/**
 * Result of querying runs to delete
 */
export interface RunsToDeleteResult {
  /** Array of run IDs to be deleted */
  runIds: number[];
  /** Total number of runs found */
  totalRuns: number;
  /** Statistics grouped by workflow ID */
  workflowStats: Map<number, WorkflowStats>;
}

/**
 * Result of deletion operation
 */
export interface DeletionResult {
  /** Number of runs successfully deleted */
  succeeded: number;
  /** Number of runs that failed to delete */
  failed: number;
}

/**
 * API metrics for monitoring and observability
 */
export interface ApiMetrics {
  /** Total number of API requests made */
  totalRequests: number;
  /** Number of successful API requests */
  successfulRequests: number;
  /** Number of failed API requests */
  failedRequests: number;
  /** Number of retry attempts */
  retries: number;
  /** Number of times rate limit was hit */
  rateLimitHits: number;
  /** Number of times circuit breaker tripped */
  circuitBreakerTrips: number;
}

/**
 * Public API interface for workflow run management
 */
export interface Api {
  /**
   * Delete multiple workflow runs
   * @param runs - Array of run IDs to delete
   * @returns Promise with deletion results
   */
  deleteRuns(runs: number[]): Promise<DeletionResult>;

  /**
   * Get list of workflow runs eligible for deletion
   * @param olderThanDays - Only include runs older than this many days
   * @param runsToKeep - Number of most recent runs to keep per workflow
   * @returns Promise with runs to delete and statistics
   */
  getRunsToDelete(
    olderThanDays?: number,
    runsToKeep?: number
  ): Promise<RunsToDeleteResult>;

  /**
   * Get current API metrics
   * @returns Current metrics snapshot
   */
  getMetrics(): ApiMetrics;
}

/**
 * Circuit breaker interface for managing failure states
 */
export interface ICircuitBreaker {
  /**
   * Record a successful operation
   */
  recordSuccess(): void;

  /**
   * Record a failed operation
   */
  recordFailure(): void;

  /**
   * Check if operation can be executed
   * @returns true if circuit allows execution
   */
  canExecute(): boolean;

  /**
   * Get current circuit state
   * @returns Current state of the circuit
   */
  getState(): CircuitState;
}
