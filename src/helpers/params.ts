import { env } from "node:process";
import { getInput } from "@actions/core";
import { ok, error, Result } from "../utils/result";

export function getToken(): Result<string> {
  const value = getInput("token", { required: false, trimWhitespace: true });

  if (value) {
    return ok(value);
  } else {
    return error("[Invalid Parameter] A token must be provided");
  }
}

export function getOwner() {
  const value = getInput("owner", { required: false, trimWhitespace: true });

  if (value) {
    return ok(value);
  } else if (env.GITHUB_REPOSITORY_OWNER) {
    return ok(env.GITHUB_REPOSITORY_OWNER);
  } else {
    return error("[Invalid Parameter] An owner must be provided");
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
    return ok(parameterRepository);
  } else if (currentRepository) {
    return ok(currentRepository);
  } else {
    error("[Invalid Parameter] A repo must be provided");
  }
}

export function getRunsToKeep(): Result<number> {
  const value = getInput("runs_to_keep", {
    required: false,
    trimWhitespace: true,
  });
  const numberValue = Number(value);

  if (Number.isSafeInteger(numberValue) && !Number.isNaN(numberValue)) {
    return ok(numberValue);
  }

  return ok(0); // Default value
}

export function getDaysOld(): Result<number> {
  const value = getInput("days_old", { required: false, trimWhitespace: true });
  const numberValue = Number(value);

  if (Number.isSafeInteger(numberValue) && !Number.isNaN(numberValue)) {
    return ok(numberValue);
  }

  return ok(7); // Default value
}
