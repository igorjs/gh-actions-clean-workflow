// SPDX-License-Identifier: MIT
import { env } from "node:process";
import {
  parseDryRun,
  parseOwner,
  parseRepo,
  parseRunsOlderThan,
  parseRunsToKeep,
  parseToken,
  parseWorkflowNames,
} from "#src/core/params";

export type ParamsDeps = {
  getInput: (
    name: string,
    opts?: { required?: boolean; trimWhitespace?: boolean }
  ) => string;
  setSecret: (value: string) => void;
};

export type Params = {
  getToken: () => string;
  getOwner: () => string;
  getRepo: () => string;
  getRunsToKeep: () => number;
  getRunsOlderThan: () => number;
  getDryRun: () => boolean;
  getWorkflowNames: () => string[];
};

export function makeParams(deps: ParamsDeps): Params {
  const { getInput, setSecret } = deps;

  function getToken(): string {
    const value = getInput("token", { required: false, trimWhitespace: true });
    const parsed = parseToken(value);
    setSecret(parsed);
    return parsed;
  }

  function getOwner(): string {
    const value = getInput("owner", { required: false, trimWhitespace: true });
    // Bracket notation is required here, not a style choice: tsconfig's
    // noPropertyAccessFromIndexSignature forbids dot access on process.env's
    // index-signature properties. Biome's useLiteralKeys rule disagrees and
    // suggests dot notation (correctly flagged as an "unsafe" fix, since
    // applying it breaks `tsc --noEmit`); this is an accepted, permanent
    // warning where the two tools' rules conflict.
    return parseOwner(value, env["GITHUB_REPOSITORY_OWNER"]);
  }

  function getRepo(): string {
    const value = getInput("repo", { required: false, trimWhitespace: true });
    // See the bracket-notation note on getOwner above.
    return parseRepo(value, env["GITHUB_REPOSITORY"]);
  }

  function getRunsToKeep(): number {
    const value = getInput("runs_to_keep", {
      required: false,
      trimWhitespace: true,
    });
    return parseRunsToKeep(value);
  }

  function getRunsOlderThan(): number {
    const value = getInput("runs_older_than", {
      required: false,
      trimWhitespace: true,
    });
    return parseRunsOlderThan(value);
  }

  function getDryRun(): boolean {
    const value = getInput("dry_run", {
      required: false,
      trimWhitespace: true,
    });
    return parseDryRun(value);
  }

  function getWorkflowNames(): string[] {
    const value = getInput("workflow_names", {
      required: false,
      trimWhitespace: true,
    });
    return parseWorkflowNames(value);
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
