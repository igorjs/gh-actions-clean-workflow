import { getInput } from "@actions/core";
import { env } from "node:process";
import { Result } from "../utils/result";

export function getToken(): Result<string> {
  const value = getInput("token", { required: false, trimWhitespace: true });

  if (value) {
    return Result.Ok(value);
  } else {
    return Result.Err("[Invalid Parameter] <token> must be provided");
  }
}

export function getOwner(): Result<string> {
  const value = getInput("owner", { required: false, trimWhitespace: true });

  if (value) {
    return Result.Ok(value);
  } else if (env.GITHUB_REPOSITORY_OWNER) {
    return Result.Ok(env.GITHUB_REPOSITORY_OWNER);
  } else {
    return Result.Err("[Invalid Parameter] <owner> must be provided");
  }
}

export function getRepo(): Result<string> {
  const value = getInput("repo", { required: false, trimWhitespace: true });
  const currentRepository = env.GITHUB_REPOSITORY?.slice(
    env.GITHUB_REPOSITORY.indexOf("/") + 1
  );
  const parameterRepository = /\\/i.test(value)
    ? value.slice(value.indexOf("/") + 1)
    : undefined;

  if (parameterRepository) {
    return Result.Ok(parameterRepository);
  } else if (currentRepository) {
    return Result.Ok(currentRepository);
  } else {
    return Result.Err("[Invalid Parameter] <repo> must be provided");
  }
}

export function getRunsToKeep(): Result<number> {
  const value = getInput("runs_to_keep", {
    required: false,
    trimWhitespace: true,
  });
  const numberValue = Number(value);

  if (Number.isSafeInteger(numberValue) && !Number.isNaN(numberValue)) {
    return Result.Ok(numberValue);
  }

  return Result.Err("[Invalid Parameter] <runs_to_keep> could not be parsed");
}

/**
 * @deprecated This method will be removed in the next major release. Use getRunsOlderThan() instead.
 */
export function getDaysOld(): Result<number> {
  const value = getInput("days_old", { required: false, trimWhitespace: true });
  const numberValue = Number(value);

  if (Number.isSafeInteger(numberValue) && !Number.isNaN(numberValue)) {
    return Result.Ok(numberValue);
  }

  return Result.Err("[Invalid Parameter] <days_old> could not be parsed");
}

export function getRunsOlderThan(): Result<number> {
  const value = getInput("runs_older_than", {
    required: false,
    trimWhitespace: true,
  });
  const numberValue = Number(value);

  if (Number.isSafeInteger(numberValue) && !Number.isNaN(numberValue)) {
    return Result.Ok(numberValue);
  }

  return Result.Err(
    "[Invalid Parameter] <runs_older_than> could not be parsed"
  );
}
