import { getInput } from "@actions/core";

function throwError(message) {
  throw new Error(message);
}

export function getToken() {
  const value = getInput("token", { required: true, trimWhitespace: true });

  return value || throwError("[Invalid Parameter] A token must be provided");
}

export function getOwner() {
  const value = getInput("owner", { required: false, trimWhitespace: true });

  return value || process.env["GITHUB_REPOSITORY_OWNER"];
}

export function getRepo() {
  const value = getInput("repo", { required: false, trimWhitespace: true });
  const currentRepository = process.env["GITHUB_REPOSITORY"];

  return value || currentRepository.slice(currentRepository.indexOf("/") + 1);
}

export function getDaysOld() {
  const value = getInput("days_old", { required: false, trimWhitespace: true });
  const numberValue = Number(value);

  if (Number.isSafeInteger(numberValue) && !Number.isNaN(numberValue)) {
    return numberValue;
  }

  return 7; // Default value
}
