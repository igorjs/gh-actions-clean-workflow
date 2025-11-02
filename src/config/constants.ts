/**
 * Application-wide constants
 */

// API Configuration
export const API_CONFIG = {
  /** Maximum number of concurrent delete requests to respect GitHub's 100 concurrent limit */
  BATCH_SIZE: 20,
  /** Rate limiting delay in ms (350ms = ~170 deletions/min with safety margin) */
  RATE_LIMIT_DELAY_MS: 350,
  /** Maximum retries for failed requests */
  MAX_RETRIES: 3,
  /** Initial retry delay in ms */
  INITIAL_RETRY_DELAY_MS: 1000,
  /** Maximum retry delay in ms */
  MAX_RETRY_DELAY_MS: 32000,
  /** Default rate limit wait time in ms when no retry-after header */
  DEFAULT_RATE_LIMIT_WAIT_MS: 60000,
} as const;

// Circuit Breaker Configuration
export const CIRCUIT_BREAKER_CONFIG = {
  /** Number of failures before opening circuit */
  FAILURE_THRESHOLD: 5,
  /** Number of successes needed to close circuit from HALF_OPEN */
  SUCCESS_THRESHOLD: 2,
  /** Time in ms to wait before attempting recovery */
  TIMEOUT_MS: 60000,
} as const;

// Validation Rules
export const VALIDATION_RULES = {
  /** Maximum value for runs_to_keep parameter */
  MAX_RUNS_TO_KEEP: 10000,
  /** Maximum value for runs_older_than parameter (days) */
  MAX_DAYS_OLD: 3650,
  /** GitHub token minimum length after prefix */
  MIN_TOKEN_LENGTH: 40,
  /** Regex for validating GitHub username/org format */
  GITHUB_NAME_REGEX: /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
  /** Regex for validating workflow name format (allows spaces, dashes, underscores, alphanumeric) */
  WORKFLOW_NAME_REGEX: /^[a-zA-Z0-9 _-]+$/,
  /** Regex for validating repository name */
  REPO_NAME_REGEX: /^[a-zA-Z0-9._-]+$/,
  /** Regex for validating GitHub token format */
  TOKEN_FORMAT_REGEX: /^(ghp_|ghs_|github_pat_)[a-zA-Z0-9]{36,}$/,
} as const;

// Log Message Prefixes
export const LOG_PREFIX = {
  INFO: "INFO:",
  WARN: "WARN:",
  ERROR: "ERROR:",
  SUCCESS: "SUCCESS:",
  DRY_RUN: "DRY RUN:",
} as const;

// Error Message Templates
export const ERROR_MESSAGES = {
  INVALID_TOKEN: "[Invalid Parameter] <token> must be provided",
  INVALID_TOKEN_FORMAT:
    "[Invalid Parameter] <token> must be a valid GitHub token (ghp_, ghs_, or github_pat_)",
  INVALID_OWNER: "[Invalid Parameter] <owner> must be provided",
  INVALID_OWNER_FORMAT:
    "[Invalid Parameter] <owner> must be a valid GitHub username or organization",
  INVALID_REPO: "[Invalid Parameter] <repo> must be provided",
  INVALID_REPO_FORMAT:
    "[Invalid Parameter] <repo> must be a valid GitHub repository name",
  INVALID_RUNS_TO_KEEP:
    "[Invalid Parameter] <runs_to_keep> must be a valid integer",
  INVALID_RUNS_TO_KEEP_NEGATIVE:
    "[Invalid Parameter] <runs_to_keep> must be non-negative",
  INVALID_RUNS_TO_KEEP_MAX:
    "[Invalid Parameter] <runs_to_keep> must be less than or equal to 10000",
  INVALID_RUNS_OLDER_THAN:
    "[Invalid Parameter] <runs_older_than> must be a valid integer",
  INVALID_RUNS_OLDER_THAN_NEGATIVE:
    "[Invalid Parameter] <runs_older_than> must be non-negative",
  INVALID_RUNS_OLDER_THAN_MAX:
    "[Invalid Parameter] <runs_older_than> must be less than or equal to 3650 days",
  INVALID_DRY_RUN:
    "[Invalid Parameter] <dry_run> must be a boolean value (true/false, yes/no, 1/0)",
  INVALID_WORKFLOW_NAMES_FORMAT:
    "[Invalid Parameter] <workflow_names> contains invalid characters. Use alphanumeric, spaces, dashes, and underscores only",
} as const;

// Default Values
export const DEFAULTS = {
  /** Default value for runs_to_keep */
  RUNS_TO_KEEP: 0,
  /** Default value for runs_older_than (days) */
  RUNS_OLDER_THAN: 7,
  /** Default value for dry_run */
  DRY_RUN: false,
  /** Default value for workflow_names (empty means all workflows) */
  WORKFLOW_NAMES: "",
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Circuit Breaker States
export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}
