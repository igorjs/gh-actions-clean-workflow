// SPDX-License-Identifier: MIT
import {
  DEFAULTS,
  ERROR_MESSAGES,
  VALIDATION_RULES,
} from "#src/config/constants";

// Pure counterparts to the getters in `src/lib/params.ts`: each function
// here takes only the already-fetched raw value(s) and returns a parsed
// result or throws, instead of calling `getInput`/`setSecret` or reading
// `env` itself, so a parsing rule can be tested with a plain string and no
// Action-runtime mocking.

// A GitHub Action input is typed as `string`, but at runtime a step with
// no input configured (or an untyped caller) can still hand back `null`
// or `undefined`, so every optional parameter below treats all three as
// "not provided".
function isBlank(value: string): boolean {
  return value === "" || value === null || value === undefined;
}

// Shared body of `parseRunsToKeep` and `parseRunsOlderThan`: both accept
// an optional non-negative integer bounded by a max, differing only in
// their default, ceiling, and error messages, so the bounds-checking
// algorithm lives in one place instead of two copies that could drift.
function parseBoundedInteger(
  value: string,
  defaultValue: number,
  max: number,
  errors: { invalid: string; negative: string; max: string }
): number {
  if (isBlank(value)) return defaultValue;
  const numberValue = Number(value);
  if (Number.isNaN(numberValue) || !Number.isSafeInteger(numberValue))
    throw new Error(errors.invalid);
  if (numberValue < 0) throw new Error(errors.negative);
  if (numberValue > max) throw new Error(errors.max);
  return numberValue;
}

export function parseToken(value: string): string {
  if (!value) throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
  if (!VALIDATION_RULES.TOKEN_FORMAT_REGEX.test(value))
    throw new Error(ERROR_MESSAGES.INVALID_TOKEN_FORMAT);
  return value;
}

export function parseOwner(
  value: string,
  envOwner: string | undefined
): string {
  if (value) {
    if (!VALIDATION_RULES.GITHUB_NAME_REGEX.test(value))
      throw new Error(ERROR_MESSAGES.INVALID_OWNER_FORMAT);
    return value;
  }
  if (envOwner) return envOwner;
  throw new Error(ERROR_MESSAGES.INVALID_OWNER);
}

// A repo input may be a bare name ("hello-world") or an "owner/repo" pair
// (matching GitHub's `github.repository` default), so only the segment
// after the last slash is kept; the same extraction runs on the
// `envRepository` fallback so both sources agree on format before
// validation.
export function parseRepo(
  value: string,
  envRepository: string | undefined
): string {
  const currentRepository = envRepository?.slice(
    envRepository.indexOf("/") + 1
  );
  const parameterRepository = value
    ? value.slice(value.lastIndexOf("/") + 1)
    : undefined;
  const repo = parameterRepository || currentRepository;
  if (!repo) throw new Error(ERROR_MESSAGES.INVALID_REPO);
  if (!VALIDATION_RULES.REPO_NAME_REGEX.test(repo))
    throw new Error(ERROR_MESSAGES.INVALID_REPO_FORMAT);
  return repo;
}

export function parseRunsToKeep(value: string): number {
  return parseBoundedInteger(
    value,
    DEFAULTS.RUNS_TO_KEEP,
    VALIDATION_RULES.MAX_RUNS_TO_KEEP,
    {
      invalid: ERROR_MESSAGES.INVALID_RUNS_TO_KEEP,
      negative: ERROR_MESSAGES.INVALID_RUNS_TO_KEEP_NEGATIVE,
      max: ERROR_MESSAGES.INVALID_RUNS_TO_KEEP_MAX,
    }
  );
}

export function parseRunsOlderThan(value: string): number {
  return parseBoundedInteger(
    value,
    DEFAULTS.RUNS_OLDER_THAN,
    VALIDATION_RULES.MAX_DAYS_OLD,
    {
      invalid: ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN,
      negative: ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN_NEGATIVE,
      max: ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN_MAX,
    }
  );
}

export function parseDryRun(value: string): boolean {
  if (isBlank(value)) return DEFAULTS.DRY_RUN;
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "no") return false;
  throw new Error(ERROR_MESSAGES.INVALID_DRY_RUN);
}

export function parseWorkflowNames(value: string): string[] {
  if (isBlank(value)) return [];
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (names.some((name) => !VALIDATION_RULES.WORKFLOW_NAME_REGEX.test(name))) {
    throw new Error(ERROR_MESSAGES.INVALID_WORKFLOW_NAMES_FORMAT);
  }
  return names;
}
