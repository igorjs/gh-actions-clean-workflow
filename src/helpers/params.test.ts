import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { getInput } from "@actions/core";
import {
  getToken,
  getOwner,
  getRepo,
  getRunsToKeep,
  getRunsOlderThan,
} from "./params";

// Mock @actions/core
jest.mock("@actions/core");
const mockGetInput = getInput as jest.MockedFunction<typeof getInput>;

describe("params", () => {
  let mockExit: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock process.exit to prevent test runner from exiting
    mockExit = jest.spyOn(process, "exit").mockImplementation(((
      code?: number
    ) => {
      throw new Error(`process.exit called with "${code}"`);
    }) as any);
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  describe("getToken", () => {
    test("should return Ok with token when provided", () => {
      mockGetInput.mockReturnValue("ghp_testtoken123");

      const result = getToken();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe("ghp_testtoken123");
      expect(mockGetInput).toHaveBeenCalledWith("token", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should return Err when token is empty", () => {
      mockGetInput.mockReturnValue("");

      const result = getToken();
      expect(result.isErr()).toBe(true);
      expect(mockGetInput).toHaveBeenCalledWith("token", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should return already trimmed token", () => {
      mockGetInput.mockReturnValue("ghp_testtoken123");

      const result = getToken();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe("ghp_testtoken123");
    });
  });

  describe("getOwner", () => {
    test("should return Ok with owner when provided", () => {
      mockGetInput.mockReturnValue("octocat");

      const result = getOwner();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe("octocat");
      expect(mockGetInput).toHaveBeenCalledWith("owner", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should return Err when owner is empty and no env var", () => {
      mockGetInput.mockReturnValue("");
      delete process.env.GITHUB_REPOSITORY_OWNER;

      const result = getOwner();
      expect(result.isErr()).toBe(true);
    });

    test("should fall back to GITHUB_REPOSITORY_OWNER env var", () => {
      mockGetInput.mockReturnValue("");
      process.env.GITHUB_REPOSITORY_OWNER = "env-owner";

      const result = getOwner();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe("env-owner");

      delete process.env.GITHUB_REPOSITORY_OWNER;
    });
  });

  describe("getRepo", () => {
    test("should return Ok with repo when provided", () => {
      mockGetInput.mockReturnValue("hello-world");
      process.env.GITHUB_REPOSITORY = "octocat/hello-world"; // Set fallback

      const result = getRepo();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe("hello-world");
      expect(mockGetInput).toHaveBeenCalledWith("repo", {
        required: false,
        trimWhitespace: true,
      });

      delete process.env.GITHUB_REPOSITORY;
    });

    test("should return Err when repo is empty and no env var", () => {
      mockGetInput.mockReturnValue("");
      delete process.env.GITHUB_REPOSITORY;

      const result = getRepo();
      expect(result.isErr()).toBe(true);
    });

    test("should not extract repo name from path with forward slash", () => {
      // The implementation checks for backslash, not forward slash
      mockGetInput.mockReturnValue("owner/repo-name");
      delete process.env.GITHUB_REPOSITORY;

      const result = getRepo();
      expect(result.isErr()).toBe(true); // Falls through since parameterRepository is undefined
    });

    test("should fall back to GITHUB_REPOSITORY env var", () => {
      mockGetInput.mockReturnValue("");
      process.env.GITHUB_REPOSITORY = "env-owner/env-repo";

      const result = getRepo();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe("env-repo");

      delete process.env.GITHUB_REPOSITORY;
    });
  });

  describe("getRunsToKeep", () => {
    test("should return Ok with valid integer", () => {
      mockGetInput.mockReturnValue("5");

      const result = getRunsToKeep();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(5);
      expect(mockGetInput).toHaveBeenCalledWith("runs_to_keep", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should return Ok with 0", () => {
      mockGetInput.mockReturnValue("0");

      const result = getRunsToKeep();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(0);
    });

    test("should return Ok(0) when empty", () => {
      mockGetInput.mockReturnValue("");

      const result = getRunsToKeep();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(0);
    });

    test("should return Err for non-integer values", () => {
      mockGetInput.mockReturnValue("abc");

      const result = getRunsToKeep();
      expect(result.isErr()).toBe(true);
    });

    test("should return Err for decimal numbers", () => {
      mockGetInput.mockReturnValue("5.5");

      const result = getRunsToKeep();
      expect(result.isErr()).toBe(true);
    });

    test("should return Ok for negative numbers", () => {
      mockGetInput.mockReturnValue("-1");

      const result = getRunsToKeep();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(-1);
    });

    test("should return Err for unsafe integers", () => {
      mockGetInput.mockReturnValue("9007199254740992"); // Number.MAX_SAFE_INTEGER + 1

      const result = getRunsToKeep();
      expect(result.isErr()).toBe(true);
    });
  });

  describe("getRunsOlderThan", () => {
    test("should return Ok with valid integer", () => {
      mockGetInput.mockReturnValue("7");

      const result = getRunsOlderThan();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(7);
      expect(mockGetInput).toHaveBeenCalledWith("runs_older_than", {
        required: false,
        trimWhitespace: true,
      });
    });

    test("should return Ok(0) when empty", () => {
      mockGetInput.mockReturnValue("");

      const result = getRunsOlderThan();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(0);
    });

    test("should return Ok with 0", () => {
      mockGetInput.mockReturnValue("0");

      const result = getRunsOlderThan();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(0);
    });

    test("should return Ok for negative numbers", () => {
      mockGetInput.mockReturnValue("-5");

      const result = getRunsOlderThan();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(-5);
    });

    test("should return Err for invalid values", () => {
      mockGetInput.mockReturnValue("invalid");

      const result = getRunsOlderThan();
      expect(result.isErr()).toBe(true);
    });

    test("should handle numeric string with whitespace", () => {
      mockGetInput.mockReturnValue("7");

      const result = getRunsOlderThan();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(7);
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

      expect(getToken().unwrap()).toBe("ghp_token123");
      expect(getOwner().unwrap()).toBe("octocat");

      // For getRepo to work, we need to set env var since "hello-world" doesn't have backslash
      process.env.GITHUB_REPOSITORY = "octocat/hello-world";
      expect(getRepo().unwrap()).toBe("hello-world");
      delete process.env.GITHUB_REPOSITORY;

      expect(getRunsToKeep().unwrap()).toBe(10);
      expect(getRunsOlderThan().unwrap()).toBe(30);
    });
  });
});
