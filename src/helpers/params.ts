import { env } from "node:process";
import { getInput } from "@actions/core";
import { Result } from "../utils/result";

export function getToken(): Result<string> {
  const value = getInput("token", { required: false, trimWhitespace: true });

  if (value) {
    return Result.Ok(value);
  } else {
    return Result.Err("[Invalid Parameter] A token must be provided");
  }
}

export function getOwner() {
  const value = getInput("owner", { required: false, trimWhitespace: true });

  if (value) {
    return Result.Ok(value);
  } else if (env.GITHUB_REPOSITORY_OWNER) {
    return Result.Ok(env.GITHUB_REPOSITORY_OWNER);
  } else {
    return Result.Err("[Invalid Parameter] An owner must be provided");
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
    Result.Err("[Invalid Parameter] A repo must be provided");
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

  return Result.Ok(0); // Default value
}

export function getDaysOld(): Result<number> {
  const value = getInput("days_old", { required: false, trimWhitespace: true });
  const numberValue = Number(value);

  if (Number.isSafeInteger(numberValue) && !Number.isNaN(numberValue)) {
    return Result.Ok(numberValue);
  }

  return Result.Ok(7); // Default value
}
