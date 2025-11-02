import { getInput } from "@actions/core";
import { env } from "node:process";

// GitHub token format validation (ghp_, ghs_, or github_pat_)
function isValidTokenFormat(token: string): boolean {
  return /^(ghp_|ghs_|github_pat_)[a-zA-Z0-9]{36,}$/.test(token);
}

export function getToken(): string {
  const value = getInput("token", { required: false, trimWhitespace: true });

  if (!value) {
    throw new Error("[Invalid Parameter] <token> must be provided");
  }

  if (!isValidTokenFormat(value)) {
    throw new Error(
      "[Invalid Parameter] <token> must be a valid GitHub token (ghp_, ghs_, or github_pat_)"
    );
  }

  return value;
}

export function getOwner(): string {
  const value = getInput("owner", { required: false, trimWhitespace: true });

  if (value) {
    // Validate owner format (GitHub username/org rules)
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(value)) {
      throw new Error(
        "[Invalid Parameter] <owner> must be a valid GitHub username or organization"
      );
    }
    return value;
  }

  if (env.GITHUB_REPOSITORY_OWNER) {
    return env.GITHUB_REPOSITORY_OWNER;
  }

  throw new Error("[Invalid Parameter] <owner> must be provided");
}

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
    throw new Error("[Invalid Parameter] <repo> must be provided");
  }

  // Validate repo format
  if (!/^[a-zA-Z0-9._-]+$/.test(repo)) {
    throw new Error(
      "[Invalid Parameter] <repo> must be a valid GitHub repository name"
    );
  }

  return repo;
}

export function getRunsToKeep(): number {
  const value = getInput("runs_to_keep", {
    required: false,
    trimWhitespace: true,
  });

  // Handle empty string - default to 0
  if (value === "" || value === null || value === undefined) {
    return 0;
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue) || !Number.isSafeInteger(numberValue)) {
    throw new Error(
      "[Invalid Parameter] <runs_to_keep> must be a valid integer"
    );
  }

  if (numberValue < 0) {
    throw new Error("[Invalid Parameter] <runs_to_keep> must be non-negative");
  }

  // Set reasonable upper limit to prevent memory issues
  if (numberValue > 10000) {
    throw new Error(
      "[Invalid Parameter] <runs_to_keep> must be less than or equal to 10000"
    );
  }

  return numberValue;
}

export function getRunsOlderThan(): number {
  const value = getInput("runs_older_than", {
    required: false,
    trimWhitespace: true,
  });

  // Handle empty string - default to 7
  if (value === "" || value === null || value === undefined) {
    return 7;
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue) || !Number.isSafeInteger(numberValue)) {
    throw new Error(
      "[Invalid Parameter] <runs_older_than> must be a valid integer"
    );
  }

  if (numberValue < 0) {
    throw new Error(
      "[Invalid Parameter] <runs_older_than> must be non-negative"
    );
  }

  // Set reasonable upper limit (max 3650 days = ~10 years)
  if (numberValue > 3650) {
    throw new Error(
      "[Invalid Parameter] <runs_older_than> must be less than or equal to 3650 days"
    );
  }

  return numberValue;
}
