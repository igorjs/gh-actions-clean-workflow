// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS } from "#src/core/params";
import { makeParams } from "#src/lib/params";

function makeGetInput(returnValue = "") {
  return vi
    .fn<[string, { required?: boolean; trimWhitespace?: boolean }?], string>()
    .mockReturnValue(returnValue);
}

function makeSetSecret() {
  return vi.fn<[string], void>();
}

describe("params", () => {
  describe("getToken", () => {
    it("should return token when provided with valid format and pass the exact getInput call shape", () => {
      const getInput = makeGetInput(
        "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
      );
      const setSecret = makeSetSecret();
      const { getToken } = makeParams({ getInput, setSecret });
      expect(getToken()).toBe("ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF");
      expect(getInput).toHaveBeenCalledWith("token", {
        required: false,
        trimWhitespace: true,
      });
    });

    it("should register the token as a secret after successful validation", () => {
      const setSecret = makeSetSecret();
      const { getToken } = makeParams({
        getInput: makeGetInput(
          "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
        ),
        setSecret,
      });
      getToken();
      expect(setSecret).toHaveBeenCalledWith(
        "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
      );
    });

    it("should not register a secret when token validation throws", () => {
      const setSecret = makeSetSecret();
      const { getToken } = makeParams({
        getInput: makeGetInput("invalid_token_123"),
        setSecret,
      });
      expect(() => getToken()).toThrow();
      expect(setSecret).not.toHaveBeenCalled();
    });
  });

  describe("getOwner", () => {
    beforeEach(() => {
      delete process.env.GITHUB_REPOSITORY_OWNER;
    });

    afterEach(() => {
      delete process.env.GITHUB_REPOSITORY_OWNER;
    });

    it("should return owner when provided with valid format", () => {
      const getInput = makeGetInput("octocat");
      const { getOwner } = makeParams({ getInput });
      expect(getOwner()).toBe("octocat");
      expect(getInput).toHaveBeenCalledWith("owner", {
        required: false,
        trimWhitespace: true,
      });
    });

    it("should fall back to GITHUB_REPOSITORY_OWNER env var", () => {
      process.env.GITHUB_REPOSITORY_OWNER = "env-owner";
      const { getOwner } = makeParams({ getInput: makeGetInput("") });
      expect(getOwner()).toBe("env-owner");
    });
  });

  describe("getRepo", () => {
    beforeEach(() => {
      delete process.env.GITHUB_REPOSITORY;
    });

    afterEach(() => {
      delete process.env.GITHUB_REPOSITORY;
    });

    it("should return repo when provided with valid format", () => {
      process.env.GITHUB_REPOSITORY = "octocat/some-other-repo";
      const getInput = makeGetInput("hello-world");
      const { getRepo } = makeParams({ getInput });
      expect(getRepo()).toBe("hello-world");
      expect(getInput).toHaveBeenCalledWith("repo", {
        required: false,
        trimWhitespace: true,
      });
    });

    it("should fall back to GITHUB_REPOSITORY env var", () => {
      process.env.GITHUB_REPOSITORY = "env-owner/env-repo";
      const { getRepo } = makeParams({ getInput: makeGetInput("") });
      expect(getRepo()).toBe("env-repo");
    });
  });

  describe("getRunsToKeep", () => {
    it("should call getInput with the expected name and options and return the default when empty", () => {
      const getInput = makeGetInput("");
      const { getRunsToKeep } = makeParams({ getInput });
      expect(getRunsToKeep()).toBe(DEFAULTS.RUNS_TO_KEEP);
      expect(getInput).toHaveBeenCalledWith("runs_to_keep", {
        required: false,
        trimWhitespace: true,
      });
    });
  });

  describe("getRunsOlderThan", () => {
    it("should call getInput with the expected name and options and return the default when empty", () => {
      const getInput = makeGetInput("");
      const { getRunsOlderThan } = makeParams({ getInput });
      expect(getRunsOlderThan()).toBe(DEFAULTS.RUNS_OLDER_THAN);
      expect(getInput).toHaveBeenCalledWith("runs_older_than", {
        required: false,
        trimWhitespace: true,
      });
    });
  });

  describe("getDryRun", () => {
    it("should call getInput with the expected name and options and return the default when empty", () => {
      const getInput = makeGetInput("");
      const { getDryRun } = makeParams({ getInput });
      expect(getDryRun()).toBe(DEFAULTS.DRY_RUN);
      expect(getInput).toHaveBeenCalledWith("dry_run", {
        required: false,
        trimWhitespace: true,
      });
    });
  });

  describe("getWorkflowNames", () => {
    it("should call getInput with the expected name and options and return an empty array when empty", () => {
      const getInput = makeGetInput("");
      const { getWorkflowNames } = makeParams({ getInput });
      expect(getWorkflowNames()).toEqual([]);
      expect(getInput).toHaveBeenCalledWith("workflow_names", {
        required: false,
        trimWhitespace: true,
      });
    });
  });
});
