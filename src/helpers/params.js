import { getInput } from "@actions/core";

function throwError(message) {
  throw new Error(message);
}

export function getToken() {
  const value = getInput("token", { required: false, trimWhitespace: true });

  return value || throwError("[Invalid Parameter] A token must be provided");
}

export function getOwner() {
  const value = getInput("owner", { required: false, trimWhitespace: true });

  return (
    value ||
    process.env["GITHUB_REPOSITORY_OWNER"] ||
    throwError("[Invalid Parameter] An owner must be provided")
  );
}

export function getRepo() {
  const value = getInput("repo", { required: false, trimWhitespace: true });
  const currentRepository = process.env["GITHUB_REPOSITORY"];
  const parameterRepository = /\\/i.test(value)
    ? value.slice(value.indexOf("/") + 1)
    : undefined;

  return (
    parameterRepository ||
    currentRepository.slice(currentRepository.indexOf("/") + 1) ||
    throwError("[Invalid Parameter] A repo must be provided")
  );
}

export function getRunsToKeep() {
  const value = getInput("runs_to_keep", { required: false, trimWhitespace: true });
  const numberValue = Number(value);

  if (Number.isSafeInteger(numberValue) && !Number.isNaN(numberValue)) {
    return numberValue;
  }

  return 0; // Default value
}

export function getDaysOld() {
  const value = getInput("days_old", { required: false, trimWhitespace: true });
  const numberValue = Number(value);

  if (Number.isSafeInteger(numberValue) && !Number.isNaN(numberValue)) {
    return numberValue;
  }

  return 7; // Default value
}
