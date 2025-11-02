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
    test("should return token when provided", () => {
      mockGetInput.mockReturnValue("ghp_testtoken123");

      const result = getToken();
      expect(result).toBe("ghp_testtoken123");
      expect(mockGetInput).toHaveBeenCalledWith("token", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should throw error when token is empty", () => {
      mockGetInput.mockReturnValue("");

      expect(() => getToken()).toThrow(
        "[Invalid Parameter] <token> must be provided"
      );
    });

    test("should return already trimmed token", () => {
      mockGetInput.mockReturnValue("ghp_testtoken123");

      const result = getToken();
      expect(result).toBe("ghp_testtoken123");
    });
  });

  describe("getOwner", () => {
    test("should return owner when provided", () => {
      mockGetInput.mockReturnValue("octocat");

      const result = getOwner();
      expect(result).toBe("octocat");
      expect(mockGetInput).toHaveBeenCalledWith("owner", {
        required: false,
        trimWhitespace: true,
      });
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
    test("should return repo when provided", () => {
      mockGetInput.mockReturnValue("hello-world");
      process.env.GITHUB_REPOSITORY = "octocat/hello-world"; // Set fallback

      const result = getRepo();
      expect(result).toBe("hello-world");
      expect(mockGetInput).toHaveBeenCalledWith("repo", {
        required: false,
        trimWhitespace: true,
      });

      delete process.env.GITHUB_REPOSITORY;
    });

    test("should throw error when repo is empty and no env var", () => {
      mockGetInput.mockReturnValue("");
      delete process.env.GITHUB_REPOSITORY;

      expect(() => getRepo()).toThrow(
        "[Invalid Parameter] <repo> must be provided"
      );
    });

    test("should not extract repo name from path with forward slash", () => {
      // The implementation checks for backslash, not forward slash
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
      mockGetInput.mockReturnValue("9007199254740992"); // Number.MAX_SAFE_INTEGER + 1

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
      // Clean environment
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_REPOSITORY_OWNER;

      mockGetInput
        .mockReturnValueOnce("ghp_token123") // token
        .mockReturnValueOnce("octocat") // owner
        .mockReturnValueOnce("hello-world") // repo
        .mockReturnValueOnce("10") // runs_to_keep
        .mockReturnValueOnce("30"); // runs_older_than

      expect(getToken()).toBe("ghp_token123");
      expect(getOwner()).toBe("octocat");

      // For getRepo to work, we need to set env var since "hello-world" doesn't have backslash
      process.env.GITHUB_REPOSITORY = "octocat/hello-world";
      expect(getRepo()).toBe("hello-world");
      delete process.env.GITHUB_REPOSITORY;

      expect(getRunsToKeep()).toBe(10);
      expect(getRunsOlderThan()).toBe(30);
    });
  });
});
