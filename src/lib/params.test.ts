import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeParams } from "./params";

function makeGetInput(returnValue = "") {
  return vi
    .fn<[string, { required?: boolean; trimWhitespace?: boolean }?], string>()
    .mockReturnValue(returnValue);
}

describe("params", () => {
  describe("getToken", () => {
    it("should return token when provided with valid format (ghp_)", () => {
      const getInput = makeGetInput(
        "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
      );
      const { getToken } = makeParams({ getInput });
      expect(getToken()).toBe("ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF");
      expect(getInput).toHaveBeenCalledWith("token", {
        required: false,
        trimWhitespace: true,
      });
    });

    it("should return token when provided with valid format (ghs_)", () => {
      const { getToken } = makeParams({
        getInput: makeGetInput(
          "ghs_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
        ),
      });
      expect(getToken()).toBe("ghs_1234567890abcdefghijklmnopqrstuvwxyzABCDEF");
    });

    it("should return token when provided with valid format (github_pat_)", () => {
      const { getToken } = makeParams({
        getInput: makeGetInput(
          "github_pat_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
        ),
      });
      expect(getToken()).toBe(
        "github_pat_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
      );
    });

    it("should return token when github_pat_ token contains underscores in the body", () => {
      const { getToken } = makeParams({
        getInput: makeGetInput(
          "github_pat_11AAABBB_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        ),
      });
      expect(getToken()).toBe(
        "github_pat_11AAABBB_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      );
    });

    it("should accept ghs_ JWT-format token with dots and dashes (stateless format rolled out 2026-04-27)", () => {
      // GitHub App installation tokens now use a stateless JWT format: ghs_APPID.HEADER.PAYLOAD
      // See: https://github.blog/changelog/2026-04-24-notice-about-upcoming-new-format-for-github-app-installation-tokens/
      // Deliberately synthetic (non-base64, low-entropy) segments to avoid triggering
      // entropy-based secret scanners while still exercising dot and dash acceptance.
      const jwtToken = "ghs_" + "fake-app-id.fake-header.fake-payload";
      const { getToken } = makeParams({ getInput: makeGetInput(jwtToken) });
      expect(getToken()).toBe(jwtToken);
    });

    it("should throw error when token is empty", () => {
      const { getToken } = makeParams({ getInput: makeGetInput("") });
      expect(() => getToken()).toThrow(
        "[Invalid Parameter] <token> must be provided"
      );
    });

    it("should throw error when token has invalid format", () => {
      const { getToken } = makeParams({
        getInput: makeGetInput("invalid_token_123"),
      });
      expect(() => getToken()).toThrow(
        "[Invalid Parameter] <token> must be a valid GitHub token"
      );
    });

    it("should return token when token has short body (new GitHub token format)", () => {
      const { getToken } = makeParams({ getInput: makeGetInput("ghp_short") });
      expect(getToken()).toBe("ghp_short");
    });
  });

  describe("getOwner", () => {
    beforeEach(() => {
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

    it("should accept owner with hyphens", () => {
      const { getOwner } = makeParams({
        getInput: makeGetInput("my-org-name"),
      });
      expect(getOwner()).toBe("my-org-name");
    });

    it("should accept owner with numbers", () => {
      const { getOwner } = makeParams({ getInput: makeGetInput("user123") });
      expect(getOwner()).toBe("user123");
    });

    it("should throw error for owner starting with hyphen", () => {
      const { getOwner } = makeParams({ getInput: makeGetInput("-invalid") });
      expect(() => getOwner()).toThrow(
        "[Invalid Parameter] <owner> must be a valid GitHub username or organization"
      );
    });

    it("should throw error for owner ending with hyphen", () => {
      const { getOwner } = makeParams({ getInput: makeGetInput("invalid-") });
      expect(() => getOwner()).toThrow(
        "[Invalid Parameter] <owner> must be a valid GitHub username or organization"
      );
    });

    it("should throw error for owner with special characters", () => {
      const { getOwner } = makeParams({
        getInput: makeGetInput("invalid@user"),
      });
      expect(() => getOwner()).toThrow(
        "[Invalid Parameter] <owner> must be a valid GitHub username or organization"
      );
    });

    it("should throw error when owner is empty and no env var", () => {
      const { getOwner } = makeParams({ getInput: makeGetInput("") });
      expect(() => getOwner()).toThrow(
        "[Invalid Parameter] <owner> must be provided"
      );
    });

    it("should fall back to GITHUB_REPOSITORY_OWNER env var", () => {
      process.env.GITHUB_REPOSITORY_OWNER = "env-owner";
      const { getOwner } = makeParams({ getInput: makeGetInput("") });
      expect(getOwner()).toBe("env-owner");
      delete process.env.GITHUB_REPOSITORY_OWNER;
    });
  });

  describe("getRepo", () => {
    beforeEach(() => {
      delete process.env.GITHUB_REPOSITORY;
    });

    it("should return repo when provided with valid format", () => {
      process.env.GITHUB_REPOSITORY = "octocat/hello-world";
      const getInput = makeGetInput("hello-world");
      const { getRepo } = makeParams({ getInput });
      expect(getRepo()).toBe("hello-world");
      expect(getInput).toHaveBeenCalledWith("repo", {
        required: false,
        trimWhitespace: true,
      });
    });

    it("should accept repo with dots and underscores", () => {
      process.env.GITHUB_REPOSITORY = "owner/my.repo_name";
      const { getRepo } = makeParams({
        getInput: makeGetInput("my.repo_name"),
      });
      expect(getRepo()).toBe("my.repo_name");
    });

    it("should throw error for repo with spaces", () => {
      process.env.GITHUB_REPOSITORY = "owner/invalid repo";
      const { getRepo } = makeParams({ getInput: makeGetInput("") });
      expect(() => getRepo()).toThrow(
        "[Invalid Parameter] <repo> must be a valid GitHub repository name"
      );
    });

    it("should throw error for repo with special characters", () => {
      process.env.GITHUB_REPOSITORY = "owner/invalid@repo";
      const { getRepo } = makeParams({ getInput: makeGetInput("") });
      expect(() => getRepo()).toThrow(
        "[Invalid Parameter] <repo> must be a valid GitHub repository name"
      );
    });

    it("should throw error when repo is empty and no env var", () => {
      const { getRepo } = makeParams({ getInput: makeGetInput("") });
      expect(() => getRepo()).toThrow(
        "[Invalid Parameter] <repo> must be provided"
      );
    });

    it("should extract repo name from path with backslash", () => {
      const { getRepo } = makeParams({
        getInput: makeGetInput("owner\\repo-name"),
      });
      expect(getRepo()).toBe("repo-name");
    });

    it("should not extract repo name from path with forward slash", () => {
      const { getRepo } = makeParams({
        getInput: makeGetInput("owner/repo-name"),
      });
      expect(() => getRepo()).toThrow(
        "[Invalid Parameter] <repo> must be provided"
      );
    });

    it("should fall back to GITHUB_REPOSITORY env var", () => {
      process.env.GITHUB_REPOSITORY = "env-owner/env-repo";
      const { getRepo } = makeParams({ getInput: makeGetInput("") });
      expect(getRepo()).toBe("env-repo");
    });
  });

  describe("getRunsToKeep", () => {
    it("should return default when empty", () => {
      const { getRunsToKeep } = makeParams({ getInput: makeGetInput("") });
      expect(getRunsToKeep()).toBe(0);
    });

    it("should return parsed integer", () => {
      const { getRunsToKeep } = makeParams({ getInput: makeGetInput("10") });
      expect(getRunsToKeep()).toBe(10);
    });

    it("should return 0 for '0'", () => {
      const { getRunsToKeep } = makeParams({ getInput: makeGetInput("0") });
      expect(getRunsToKeep()).toBe(0);
    });

    it("should throw for negative value", () => {
      const { getRunsToKeep } = makeParams({ getInput: makeGetInput("-1") });
      expect(() => getRunsToKeep()).toThrow(
        "[Invalid Parameter] <runs_to_keep> must be non-negative"
      );
    });

    it("should throw for non-integer", () => {
      const { getRunsToKeep } = makeParams({ getInput: makeGetInput("abc") });
      expect(() => getRunsToKeep()).toThrow(
        "[Invalid Parameter] <runs_to_keep> must be a valid integer"
      );
    });

    it("should throw for float", () => {
      const { getRunsToKeep } = makeParams({ getInput: makeGetInput("1.5") });
      expect(() => getRunsToKeep()).toThrow(
        "[Invalid Parameter] <runs_to_keep> must be a valid integer"
      );
    });

    it("should throw for value above max", () => {
      const { getRunsToKeep } = makeParams({ getInput: makeGetInput("10001") });
      expect(() => getRunsToKeep()).toThrow(
        "[Invalid Parameter] <runs_to_keep> must be less than or equal to 10000"
      );
    });
  });

  describe("getRunsOlderThan", () => {
    it("should return default when empty", () => {
      const { getRunsOlderThan } = makeParams({ getInput: makeGetInput("") });
      expect(getRunsOlderThan()).toBe(7);
    });

    it("should return parsed integer", () => {
      const { getRunsOlderThan } = makeParams({ getInput: makeGetInput("30") });
      expect(getRunsOlderThan()).toBe(30);
    });

    it("should throw for negative value", () => {
      const { getRunsOlderThan } = makeParams({ getInput: makeGetInput("-1") });
      expect(() => getRunsOlderThan()).toThrow(
        "[Invalid Parameter] <runs_older_than> must be non-negative"
      );
    });

    it("should throw for non-integer", () => {
      const { getRunsOlderThan } = makeParams({
        getInput: makeGetInput("abc"),
      });
      expect(() => getRunsOlderThan()).toThrow(
        "[Invalid Parameter] <runs_older_than> must be a valid integer"
      );
    });

    it("should throw for value above max", () => {
      const { getRunsOlderThan } = makeParams({
        getInput: makeGetInput("3651"),
      });
      expect(() => getRunsOlderThan()).toThrow(
        "[Invalid Parameter] <runs_older_than> must be less than or equal to 3650 days"
      );
    });
  });

  describe("getDryRun", () => {
    it("should return false as default when empty", () => {
      const { getDryRun } = makeParams({ getInput: makeGetInput("") });
      expect(getDryRun()).toBe(false);
    });

    it("should return true for 'true'", () => {
      const { getDryRun } = makeParams({ getInput: makeGetInput("true") });
      expect(getDryRun()).toBe(true);
    });

    it("should return true for '1'", () => {
      const { getDryRun } = makeParams({ getInput: makeGetInput("1") });
      expect(getDryRun()).toBe(true);
    });

    it("should return true for 'yes'", () => {
      const { getDryRun } = makeParams({ getInput: makeGetInput("yes") });
      expect(getDryRun()).toBe(true);
    });

    it("should return false for 'false'", () => {
      const { getDryRun } = makeParams({ getInput: makeGetInput("false") });
      expect(getDryRun()).toBe(false);
    });

    it("should return false for '0'", () => {
      const { getDryRun } = makeParams({ getInput: makeGetInput("0") });
      expect(getDryRun()).toBe(false);
    });

    it("should return false for 'no'", () => {
      const { getDryRun } = makeParams({ getInput: makeGetInput("no") });
      expect(getDryRun()).toBe(false);
    });

    it("should throw for invalid value", () => {
      const { getDryRun } = makeParams({ getInput: makeGetInput("maybe") });
      expect(() => getDryRun()).toThrow(
        "[Invalid Parameter] <dry_run> must be a boolean value"
      );
    });
  });

  describe("getWorkflowNames", () => {
    it("should return empty array when empty", () => {
      const { getWorkflowNames } = makeParams({ getInput: makeGetInput("") });
      expect(getWorkflowNames()).toEqual([]);
    });

    it("should parse comma-separated names", () => {
      const { getWorkflowNames } = makeParams({
        getInput: makeGetInput("CI, Deploy, Tests"),
      });
      expect(getWorkflowNames()).toEqual(["CI", "Deploy", "Tests"]);
    });

    it("should trim whitespace from names", () => {
      const { getWorkflowNames } = makeParams({
        getInput: makeGetInput("  CI  ,  Deploy  "),
      });
      expect(getWorkflowNames()).toEqual(["CI", "Deploy"]);
    });

    it("should accept workflow names with dots", () => {
      const { getWorkflowNames } = makeParams({
        getInput: makeGetInput("Node.js CI, ci.build, Deploy"),
      });
      expect(getWorkflowNames()).toEqual(["Node.js CI", "ci.build", "Deploy"]);
    });

    it("should throw for names with invalid characters", () => {
      const { getWorkflowNames } = makeParams({
        getInput: makeGetInput("CI, Deploy@prod"),
      });
      expect(() => getWorkflowNames()).toThrow(
        "[Invalid Parameter] <workflow_names> contains invalid characters"
      );
    });
  });
});
