/**
 * Input parameter validation and retrieval
 */

import { getInput } from "@actions/core";
import { env } from "node:process";
import {
  DEFAULTS,
  ERROR_MESSAGES,
  VALIDATION_RULES,
} from "../config/constants";

/**
 * Validates GitHub token format
 * @param token - Token string to validate
 * @returns true if token format is valid
 */
function isValidTokenFormat(token: string): boolean {
  return VALIDATION_RULES.TOKEN_FORMAT_REGEX.test(token);
}

/**
 * Validates GitHub username or organization name format
 * @param name - Name to validate
 * @returns true if name format is valid
 */
function isValidGitHubName(name: string): boolean {
  return VALIDATION_RULES.GITHUB_NAME_REGEX.test(name);
}

/**
 * Validates repository name format
 * @param name - Repository name to validate
 * @returns true if name format is valid
 */
function isValidRepoName(name: string): boolean {
  return VALIDATION_RULES.REPO_NAME_REGEX.test(name);
}

/**
 * Gets and validates the GitHub token from action inputs
 * @returns Validated GitHub token
 * @throws Error if token is missing or invalid
 */
export function getToken(): string {
  const value = getInput("token", { required: false, trimWhitespace: true });

  if (!value) {
    throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
  }

  if (!isValidTokenFormat(value)) {
    throw new Error(ERROR_MESSAGES.INVALID_TOKEN_FORMAT);
  }

  return value;
}

/**
 * Gets and validates the repository owner from action inputs or environment
 * @returns Validated repository owner
 * @throws Error if owner is missing or invalid
 */
export function getOwner(): string {
  const value = getInput("owner", { required: false, trimWhitespace: true });

  if (value) {
    if (!isValidGitHubName(value)) {
      throw new Error(ERROR_MESSAGES.INVALID_OWNER_FORMAT);
    }
    return value;
  }

  if (env.GITHUB_REPOSITORY_OWNER) {
    return env.GITHUB_REPOSITORY_OWNER;
  }

  throw new Error(ERROR_MESSAGES.INVALID_OWNER);
}

/**
 * Gets and validates the repository name from action inputs or environment
 * @returns Validated repository name
 * @throws Error if repo is missing or invalid
 */
export function getRepo(): string {
  const value = getInput("repo", { required: false, trimWhitespace: true });
  const currentRepository = env.GITHUB_REPOSITORY?.slice(
    env.GITHUB_REPOSITORY.indexOf("/") + 1
  );
  const parameterRepository = /\\/i.test(value)
    ? value.slice(value.indexOf("\\") + 1)
    : undefined;

  const repo = parameterRepository || currentRepository;

  if (!repo) {
    throw new Error(ERROR_MESSAGES.INVALID_REPO);
  }

  if (!isValidRepoName(repo)) {
    throw new Error(ERROR_MESSAGES.INVALID_REPO_FORMAT);
  }

  return repo;
}

/**
 * Gets and validates the number of runs to keep per workflow
 * @returns Number of runs to keep (0 if not specified)
 * @throws Error if value is invalid
 */
export function getRunsToKeep(): number {
  const value = getInput("runs_to_keep", {
    required: false,
    trimWhitespace: true,
  });

  if (value === "" || value === null || value === undefined) {
    return DEFAULTS.RUNS_TO_KEEP;
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue) || !Number.isSafeInteger(numberValue)) {
    throw new Error(ERROR_MESSAGES.INVALID_RUNS_TO_KEEP);
  }

  if (numberValue < 0) {
    throw new Error(ERROR_MESSAGES.INVALID_RUNS_TO_KEEP_NEGATIVE);
  }

  if (numberValue > VALIDATION_RULES.MAX_RUNS_TO_KEEP) {
    throw new Error(ERROR_MESSAGES.INVALID_RUNS_TO_KEEP_MAX);
  }

  return numberValue;
}

/**
 * Gets and validates the age threshold for runs in days
 * @returns Number of days (7 if not specified)
 * @throws Error if value is invalid
 */
export function getRunsOlderThan(): number {
  const value = getInput("runs_older_than", {
    required: false,
    trimWhitespace: true,
  });

  if (value === "" || value === null || value === undefined) {
    return DEFAULTS.RUNS_OLDER_THAN;
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue) || !Number.isSafeInteger(numberValue)) {
    throw new Error(ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN);
  }

  if (numberValue < 0) {
    throw new Error(ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN_NEGATIVE);
  }

  if (numberValue > VALIDATION_RULES.MAX_DAYS_OLD) {
    throw new Error(ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN_MAX);
  }

  return numberValue;
}

/**
 * Gets and validates the dry-run flag
 * @returns true if dry-run mode is enabled
 * @throws Error if value is invalid
 */
export function getDryRun(): boolean {
  const value = getInput("dry_run", {
    required: false,
    trimWhitespace: true,
  });

  if (value === "" || value === null || value === undefined) {
    return DEFAULTS.DRY_RUN;
  }

  const lowerValue = value.toLowerCase();

  if (lowerValue === "true" || lowerValue === "1" || lowerValue === "yes") {
    return true;
  }

  if (lowerValue === "false" || lowerValue === "0" || lowerValue === "no") {
    return false;
  }

  throw new Error(ERROR_MESSAGES.INVALID_DRY_RUN);
}

/**
 * Gets and validates workflow names filter (comma-separated)
 * @returns Array of workflow names to filter, or empty array for all workflows
 * @throws Error if value contains invalid characters
 */
export function getWorkflowNames(): string[] {
  const value = getInput("workflow_names", {
    required: false,
    trimWhitespace: true,
  });

  if (value === "" || value === null || value === undefined) {
    return [];
  }

  // Split by comma and trim whitespace
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  // Validate each workflow name
  for (const name of names) {
    if (!VALIDATION_RULES.WORKFLOW_NAME_REGEX.test(name)) {
      throw new Error(ERROR_MESSAGES.INVALID_WORKFLOW_NAMES_FORMAT);
    }
  }

  return names;
}
