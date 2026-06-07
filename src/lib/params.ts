import { env } from "node:process";
import { DEFAULTS, ERROR_MESSAGES, VALIDATION_RULES } from "../config/constants";
import type { Params, ParamsDeps } from "../config/types";

export function makeParams(deps: ParamsDeps): Params {
  const { getInput } = deps;

  function getToken(): string {
    const value = getInput("token", { required: false, trimWhitespace: true });
    if (!value) throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    if (!VALIDATION_RULES.TOKEN_FORMAT_REGEX.test(value))
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN_FORMAT);
    return value;
  }

  function getOwner(): string {
    const value = getInput("owner", { required: false, trimWhitespace: true });
    if (value) {
      if (!VALIDATION_RULES.GITHUB_NAME_REGEX.test(value))
        throw new Error(ERROR_MESSAGES.INVALID_OWNER_FORMAT);
      return value;
    }
    if (env.GITHUB_REPOSITORY_OWNER) return env.GITHUB_REPOSITORY_OWNER;
    throw new Error(ERROR_MESSAGES.INVALID_OWNER);
  }

  function getRepo(): string {
    const value = getInput("repo", { required: false, trimWhitespace: true });
    const currentRepository = env.GITHUB_REPOSITORY?.slice(
      env.GITHUB_REPOSITORY.indexOf("/") + 1
    );
    const parameterRepository = /\\/i.test(value)
      ? value.slice(value.indexOf("\\") + 1)
      : undefined;
    const repo = parameterRepository || currentRepository;
    if (!repo) throw new Error(ERROR_MESSAGES.INVALID_REPO);
    if (!VALIDATION_RULES.REPO_NAME_REGEX.test(repo))
      throw new Error(ERROR_MESSAGES.INVALID_REPO_FORMAT);
    return repo;
  }

  function getRunsToKeep(): number {
    const value = getInput("runs_to_keep", {
      required: false,
      trimWhitespace: true,
    });
    if (value === "" || value === null || value === undefined)
      return DEFAULTS.RUNS_TO_KEEP;
    const numberValue = Number(value);
    if (Number.isNaN(numberValue) || !Number.isSafeInteger(numberValue))
      throw new Error(ERROR_MESSAGES.INVALID_RUNS_TO_KEEP);
    if (numberValue < 0)
      throw new Error(ERROR_MESSAGES.INVALID_RUNS_TO_KEEP_NEGATIVE);
    if (numberValue > VALIDATION_RULES.MAX_RUNS_TO_KEEP)
      throw new Error(ERROR_MESSAGES.INVALID_RUNS_TO_KEEP_MAX);
    return numberValue;
  }

  function getRunsOlderThan(): number {
    const value = getInput("runs_older_than", {
      required: false,
      trimWhitespace: true,
    });
    if (value === "" || value === null || value === undefined)
      return DEFAULTS.RUNS_OLDER_THAN;
    const numberValue = Number(value);
    if (Number.isNaN(numberValue) || !Number.isSafeInteger(numberValue))
      throw new Error(ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN);
    if (numberValue < 0)
      throw new Error(ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN_NEGATIVE);
    if (numberValue > VALIDATION_RULES.MAX_DAYS_OLD)
      throw new Error(ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN_MAX);
    return numberValue;
  }

  function getDryRun(): boolean {
    const value = getInput("dry_run", {
      required: false,
      trimWhitespace: true,
    });
    if (value === "" || value === null || value === undefined)
      return DEFAULTS.DRY_RUN;
    const lower = value.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
    throw new Error(ERROR_MESSAGES.INVALID_DRY_RUN);
  }

  function getWorkflowNames(): string[] {
    const value = getInput("workflow_names", {
      required: false,
      trimWhitespace: true,
    });
    if (value === "" || value === null || value === undefined) return [];
    const names = value
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    for (const name of names) {
      if (!VALIDATION_RULES.WORKFLOW_NAME_REGEX.test(name))
        throw new Error(ERROR_MESSAGES.INVALID_WORKFLOW_NAMES_FORMAT);
    }
    return names;
  }

  return {
    getToken,
    getOwner,
    getRepo,
    getRunsToKeep,
    getRunsOlderThan,
    getDryRun,
    getWorkflowNames,
  };
}
