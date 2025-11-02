import { getInput } from "@actions/core";
import { env } from "node:process";

export function getToken(): string {
  const value = getInput("token", { required: false, trimWhitespace: true });

  if (!value) {
    throw new Error("[Invalid Parameter] <token> must be provided");
  }

  return value;
}

export function getOwner(): string {
  const value = getInput("owner", { required: false, trimWhitespace: true });

  if (value) {
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
    ? value.slice(value.indexOf("/") + 1)
    : undefined;

  if (parameterRepository) {
    return parameterRepository;
  }

  if (currentRepository) {
    return currentRepository;
  }

  throw new Error("[Invalid Parameter] <repo> must be provided");
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

  return numberValue;
}
