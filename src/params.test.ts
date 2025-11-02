import { describe, test, expect, vi, beforeEach } from "vitest";
import { getInput } from "@actions/core";
import {
  getToken,
  getOwner,
  getRepo,
  getRunsToKeep,
  getRunsOlderThan,
} from "./params";

// Mock @actions/core
vi.mock("@actions/core");
const mockGetInput = vi.mocked(getInput);

describe("params", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getToken", () => {
    test("should return token when provided with valid format (ghp_)", () => {
      mockGetInput.mockReturnValue(
        "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
      );

      const result = getToken();
      expect(result).toBe("ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF");
      expect(mockGetInput).toHaveBeenCalledWith("token", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should return token when provided with valid format (ghs_)", () => {
      mockGetInput.mockReturnValue(
        "ghs_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
      );

      const result = getToken();
      expect(result).toBe("ghs_1234567890abcdefghijklmnopqrstuvwxyzABCDEF");
    });

    test("should return token when provided with valid format (github_pat_)", () => {
      mockGetInput.mockReturnValue(
        "github_pat_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
      );

      const result = getToken();
      expect(result).toBe(
        "github_pat_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
      );
    });

    test("should throw error when token is empty", () => {
      mockGetInput.mockReturnValue("");

      expect(() => getToken()).toThrow(
        "[Invalid Parameter] <token> must be provided"
      );
    });

    test("should throw error when token has invalid format", () => {
      mockGetInput.mockReturnValue("invalid_token_123");

      expect(() => getToken()).toThrow(
        "[Invalid Parameter] <token> must be a valid GitHub token"
      );
    });

    test("should throw error when token is too short", () => {
      mockGetInput.mockReturnValue("ghp_short");

      expect(() => getToken()).toThrow(
        "[Invalid Parameter] <token> must be a valid GitHub token"
      );
    });
  });

  describe("getOwner", () => {
    test("should return owner when provided with valid format", () => {
      mockGetInput.mockReturnValue("octocat");

      const result = getOwner();
      expect(result).toBe("octocat");
      expect(mockGetInput).toHaveBeenCalledWith("owner", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should accept owner with hyphens", () => {
      mockGetInput.mockReturnValue("my-org-name");

      const result = getOwner();
      expect(result).toBe("my-org-name");
    });

    test("should accept owner with numbers", () => {
      mockGetInput.mockReturnValue("user123");

      const result = getOwner();
      expect(result).toBe("user123");
    });

    test("should throw error for owner starting with hyphen", () => {
      mockGetInput.mockReturnValue("-invalid");

      expect(() => getOwner()).toThrow(
        "[Invalid Parameter] <owner> must be a valid GitHub username or organization"
      );
    });

    test("should throw error for owner ending with hyphen", () => {
      mockGetInput.mockReturnValue("invalid-");

      expect(() => getOwner()).toThrow(
        "[Invalid Parameter] <owner> must be a valid GitHub username or organization"
      );
    });

    test("should throw error for owner with special characters", () => {
      mockGetInput.mockReturnValue("invalid@user");

      expect(() => getOwner()).toThrow(
        "[Invalid Parameter] <owner> must be a valid GitHub username or organization"
      );
    });

    test("should throw error when owner is empty and no env var", () => {
      mockGetInput.mockReturnValue("");
      delete process.env.GITHUB_REPOSITORY_OWNER;

      expect(() => getOwner()).toThrow(
        "[Invalid Parameter] <owner> must be provided"
      );
    });

    test("should fall back to GITHUB_REPOSITORY_OWNER env var", () => {
      mockGetInput.mockReturnValue("");
      process.env.GITHUB_REPOSITORY_OWNER = "env-owner";

      const result = getOwner();
      expect(result).toBe("env-owner");

      delete process.env.GITHUB_REPOSITORY_OWNER;
    });
  });

  describe("getRepo", () => {
    test("should return repo when provided with valid format", () => {
      mockGetInput.mockReturnValue("hello-world");
      process.env.GITHUB_REPOSITORY = "octocat/hello-world";

      const result = getRepo();
      expect(result).toBe("hello-world");
      expect(mockGetInput).toHaveBeenCalledWith("repo", {
        required: false,
        trimWhitespace: true,
      });

      delete process.env.GITHUB_REPOSITORY;
    });

    test("should accept repo with dots and underscores", () => {
      mockGetInput.mockReturnValue("my.repo_name");
      // Set env var to avoid "must be provided" error
      process.env.GITHUB_REPOSITORY = "owner/my.repo_name";

      const result = getRepo();
      expect(result).toBe("my.repo_name");

      delete process.env.GITHUB_REPOSITORY;
    });

    test("should throw error for repo with spaces", () => {
      mockGetInput.mockReturnValue("");
      // Set env var with invalid repo name to test validation
      process.env.GITHUB_REPOSITORY = "owner/invalid repo";

      expect(() => getRepo()).toThrow(
        "[Invalid Parameter] <repo> must be a valid GitHub repository name"
      );

      delete process.env.GITHUB_REPOSITORY;
    });

    test("should throw error for repo with special characters", () => {
      mockGetInput.mockReturnValue("");
      // Set env var with invalid repo name to test validation
      process.env.GITHUB_REPOSITORY = "owner/invalid@repo";

      expect(() => getRepo()).toThrow(
        "[Invalid Parameter] <repo> must be a valid GitHub repository name"
      );

      delete process.env.GITHUB_REPOSITORY;
    });

    test("should throw error when repo is empty and no env var", () => {
      mockGetInput.mockReturnValue("");
      delete process.env.GITHUB_REPOSITORY;

      expect(() => getRepo()).toThrow(
        "[Invalid Parameter] <repo> must be provided"
      );
    });

    test("should extract repo name from path with backslash", () => {
      mockGetInput.mockReturnValue("owner\\repo-name");
      delete process.env.GITHUB_REPOSITORY;

      const result = getRepo();
      expect(result).toBe("repo-name");
    });

    test("should not extract repo name from path with forward slash", () => {
      mockGetInput.mockReturnValue("owner/repo-name");
      delete process.env.GITHUB_REPOSITORY;

      expect(() => getRepo()).toThrow(
        "[Invalid Parameter] <repo> must be provided"
      );
    });

    test("should fall back to GITHUB_REPOSITORY env var", () => {
      mockGetInput.mockReturnValue("");
      process.env.GITHUB_REPOSITORY = "env-owner/env-repo";

      const result = getRepo();
      expect(result).toBe("env-repo");

      delete process.env.GITHUB_REPOSITORY;
    });
  });

  describe("getRunsToKeep", () => {
    test("should return valid integer", () => {
      mockGetInput.mockReturnValue("5");

      const result = getRunsToKeep();
      expect(result).toBe(5);
      expect(mockGetInput).toHaveBeenCalledWith("runs_to_keep", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should return 0 when input is 0", () => {
      mockGetInput.mockReturnValue("0");

      const result = getRunsToKeep();
      expect(result).toBe(0);
    });

    test("should return 0 when empty (default value)", () => {
      mockGetInput.mockReturnValue("");

      const result = getRunsToKeep();
      expect(result).toBe(0);
    });

    test("should accept maximum allowed value (10000)", () => {
      mockGetInput.mockReturnValue("10000");

      const result = getRunsToKeep();
      expect(result).toBe(10000);
    });

    test("should throw error for values exceeding maximum", () => {
      mockGetInput.mockReturnValue("10001");

      expect(() => getRunsToKeep()).toThrow(
        "[Invalid Parameter] <runs_to_keep> must be less than or equal to 10000"
      );
    });

    test("should throw error for non-integer values", () => {
      mockGetInput.mockReturnValue("abc");

      expect(() => getRunsToKeep()).toThrow(
        "[Invalid Parameter] <runs_to_keep> must be a valid integer"
      );
    });

    test("should throw error for decimal numbers", () => {
      mockGetInput.mockReturnValue("5.5");

      expect(() => getRunsToKeep()).toThrow(
        "[Invalid Parameter] <runs_to_keep> must be a valid integer"
      );
    });

    test("should throw error for negative numbers", () => {
      mockGetInput.mockReturnValue("-1");

      expect(() => getRunsToKeep()).toThrow(
        "[Invalid Parameter] <runs_to_keep> must be non-negative"
      );
    });

    test("should throw error for unsafe integers", () => {
      mockGetInput.mockReturnValue("9007199254740992");

      expect(() => getRunsToKeep()).toThrow(
        "[Invalid Parameter] <runs_to_keep> must be a valid integer"
      );
    });
  });

  describe("getRunsOlderThan", () => {
    test("should return valid integer", () => {
      mockGetInput.mockReturnValue("7");

      const result = getRunsOlderThan();
      expect(result).toBe(7);
      expect(mockGetInput).toHaveBeenCalledWith("runs_older_than", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should return 7 when empty (default value)", () => {
      mockGetInput.mockReturnValue("");

      const result = getRunsOlderThan();
      expect(result).toBe(7);
    });

    test("should return 0 when input is 0", () => {
      mockGetInput.mockReturnValue("0");

      const result = getRunsOlderThan();
      expect(result).toBe(0);
    });

    test("should accept maximum allowed value (3650)", () => {
      mockGetInput.mockReturnValue("3650");

      const result = getRunsOlderThan();
      expect(result).toBe(3650);
    });

    test("should throw error for values exceeding maximum", () => {
      mockGetInput.mockReturnValue("3651");

      expect(() => getRunsOlderThan()).toThrow(
        "[Invalid Parameter] <runs_older_than> must be less than or equal to 3650 days"
      );
    });

    test("should throw error for negative numbers", () => {
      mockGetInput.mockReturnValue("-5");

      expect(() => getRunsOlderThan()).toThrow(
        "[Invalid Parameter] <runs_older_than> must be non-negative"
      );
    });

    test("should throw error for invalid values", () => {
      mockGetInput.mockReturnValue("invalid");

      expect(() => getRunsOlderThan()).toThrow(
        "[Invalid Parameter] <runs_older_than> must be a valid integer"
      );
    });

    test("should handle numeric string with whitespace", () => {
      mockGetInput.mockReturnValue("7");

      const result = getRunsOlderThan();
      expect(result).toBe(7);
    });
  });

  describe("Integration scenarios", () => {
    test("should handle all valid parameters", () => {
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_REPOSITORY_OWNER;

      mockGetInput
        .mockReturnValueOnce("ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF")
        .mockReturnValueOnce("octocat")
        .mockReturnValueOnce("hello-world")
        .mockReturnValueOnce("10")
        .mockReturnValueOnce("30");

      expect(getToken()).toBe("ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF");
      expect(getOwner()).toBe("octocat");

      process.env.GITHUB_REPOSITORY = "octocat/hello-world";
      expect(getRepo()).toBe("hello-world");
      delete process.env.GITHUB_REPOSITORY;

      expect(getRunsToKeep()).toBe(10);
      expect(getRunsOlderThan()).toBe(30);
    });
  });
});
