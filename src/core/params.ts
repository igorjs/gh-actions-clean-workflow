// SPDX-License-Identifier: MIT

export const VALIDATION_RULES = {
  MAX_RUNS_TO_KEEP: 10000,
  MAX_DAYS_OLD: 3650,
  GITHUB_NAME_REGEX: /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
  WORKFLOW_NAME_REGEX: /^[a-zA-Z0-9 ._-]+$/,
  REPO_NAME_REGEX: /^[a-zA-Z0-9._-]+$/,
  /**
   * Regex for validating GitHub token format. Only the prefix is checked, per
   * GitHub's 2026-04-24 guidance: the body is opaque and may be up to ~520
   * characters (stateless ghs_ JWT format, see the 2026-05-15 changelog on the
   * X-GitHub-Stateless-S2S-Token override header). Do not add a length or body
   * character-class check here.
   */
  TOKEN_FORMAT_REGEX: /^(ghp_|ghs_|github_pat_)/,
} as const;

export const ERROR_MESSAGES = {
  INVALID_TOKEN: "[Invalid Parameter] <token> must be provided",
  INVALID_TOKEN_FORMAT:
    "[Invalid Parameter] <token> must be a valid GitHub token (ghp_, ghs_, or github_pat_)",
  INVALID_OWNER: "[Invalid Parameter] <owner> must be provided",
  INVALID_OWNER_FORMAT:
    "[Invalid Parameter] <owner> must be a valid GitHub username or organization",
  INVALID_REPO: "[Invalid Parameter] <repo> must be provided",
  INVALID_REPO_FORMAT:
    "[Invalid Parameter] <repo> must be a valid GitHub repository name",
  INVALID_RUNS_TO_KEEP:
    "[Invalid Parameter] <runs_to_keep> must be a valid integer",
  INVALID_RUNS_TO_KEEP_NEGATIVE:
    "[Invalid Parameter] <runs_to_keep> must be non-negative",
  INVALID_RUNS_TO_KEEP_MAX:
    "[Invalid Parameter] <runs_to_keep> must be less than or equal to 10000",
  INVALID_RUNS_OLDER_THAN:
    "[Invalid Parameter] <runs_older_than> must be a valid integer",
  INVALID_RUNS_OLDER_THAN_NEGATIVE:
    "[Invalid Parameter] <runs_older_than> must be non-negative",
  INVALID_RUNS_OLDER_THAN_MAX:
    "[Invalid Parameter] <runs_older_than> must be less than or equal to 3650 days",
  INVALID_DRY_RUN:
    "[Invalid Parameter] <dry_run> must be a boolean value (true/false, yes/no, 1/0)",
  INVALID_WORKFLOW_NAMES_FORMAT:
    "[Invalid Parameter] <workflow_names> contains invalid characters. Use alphanumeric, spaces, dots, dashes, and underscores only",
} as const;

export const DEFAULTS = {
  RUNS_TO_KEEP: 0,
  RUNS_OLDER_THAN: 7,
  DRY_RUN: false,
} as const;

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
