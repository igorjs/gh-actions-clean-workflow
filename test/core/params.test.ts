// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  ERROR_MESSAGES,
  parseDryRun,
  parseOwner,
  parseRepo,
  parseRunsOlderThan,
  parseRunsToKeep,
  parseToken,
  parseWorkflowNames,
  VALIDATION_RULES,
} from "#src/core/params";

describe("parseToken", () => {
  it("should return token when provided with valid format (ghp_)", () => {
    expect(parseToken("ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF")).toBe(
      "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
    );
  });

  it("should return token when provided with valid format (ghs_)", () => {
    expect(parseToken("ghs_1234567890abcdefghijklmnopqrstuvwxyzABCDEF")).toBe(
      "ghs_1234567890abcdefghijklmnopqrstuvwxyzABCDEF"
    );
  });

  it("should return token when provided with valid format (github_pat_)", () => {
    expect(
      parseToken("github_pat_1234567890abcdefghijklmnopqrstuvwxyzABCDEF")
    ).toBe("github_pat_1234567890abcdefghijklmnopqrstuvwxyzABCDEF");
  });

  it("should return token when github_pat_ token contains underscores in the body", () => {
    const token =
      "github_pat_11AAABBB_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    expect(parseToken(token)).toBe(token);
  });

  it("should accept ghs_ JWT-format token with dots and dashes (stateless format rolled out 2026-04-27)", () => {
    // GitHub App installation tokens now use a stateless JWT format: ghs_APPID.HEADER.PAYLOAD
    // See: https://github.blog/changelog/2026-04-24-notice-about-upcoming-new-format-for-github-app-installation-tokens/
    // Deliberately synthetic (non-base64, low-entropy) segments to avoid triggering
    // entropy-based secret scanners while still exercising dot and dash acceptance.
    const jwtToken = "ghs_" + "fake-app-id.fake-header.fake-payload";
    expect(parseToken(jwtToken)).toBe(jwtToken);
  });

  it("should accept a ~520-character ghs_ stateless token with two dots (per the 2026-05-15 override-header changelog)", () => {
    // GitHub's stateless installation token format is a ghs_-prefixed JWT,
    // ~520 characters long, containing exactly two dots (header.payload.signature).
    // See: https://github.blog/changelog/2026-05-15-github-app-installation-tokens-per-request-override-header
    // Built via repetition (not a literal secret-shaped string) to avoid tripping
    // entropy-based secret scanners while still exercising the real length and dot count.
    const segment = "fake-low-entropy-segment-".repeat(7);
    const jwtToken = `ghs_${segment}.${segment}.${segment}`;
    expect(jwtToken.length).toBeGreaterThan(500);
    expect(jwtToken.split(".").length - 1).toBe(2);

    expect(parseToken(jwtToken)).toBe(jwtToken);
  });

  it("should return token when token has short body (new GitHub token format)", () => {
    expect(parseToken("ghp_short")).toBe("ghp_short");
  });

  it("should throw error when token is empty", () => {
    expect(() => parseToken("")).toThrow(ERROR_MESSAGES.INVALID_TOKEN);
  });

  it("should throw error when token has invalid format", () => {
    expect(() => parseToken("invalid_token_123")).toThrow(
      ERROR_MESSAGES.INVALID_TOKEN_FORMAT
    );
  });
});

describe("parseOwner", () => {
  it("should return owner when provided with valid format", () => {
    expect(parseOwner("octocat", undefined)).toBe("octocat");
  });

  it("should accept owner with hyphens", () => {
    expect(parseOwner("my-org-name", undefined)).toBe("my-org-name");
  });

  it("should accept owner with numbers", () => {
    expect(parseOwner("user123", undefined)).toBe("user123");
  });

  it("should throw error for owner starting with hyphen", () => {
    expect(() => parseOwner("-invalid", undefined)).toThrow(
      ERROR_MESSAGES.INVALID_OWNER_FORMAT
    );
  });

  it("should throw error for owner ending with hyphen", () => {
    expect(() => parseOwner("invalid-", undefined)).toThrow(
      ERROR_MESSAGES.INVALID_OWNER_FORMAT
    );
  });

  it("should throw error for owner with special characters", () => {
    expect(() => parseOwner("invalid@user", undefined)).toThrow(
      ERROR_MESSAGES.INVALID_OWNER_FORMAT
    );
  });

  it("should throw error when owner is empty and no env var", () => {
    expect(() => parseOwner("", undefined)).toThrow(
      ERROR_MESSAGES.INVALID_OWNER
    );
  });

  it("should fall back to GITHUB_REPOSITORY_OWNER env var", () => {
    expect(parseOwner("", "env-owner")).toBe("env-owner");
  });
});

describe("parseRepo", () => {
  it("should return repo when provided with valid format", () => {
    expect(parseRepo("hello-world", "octocat/some-other-repo")).toBe(
      "hello-world"
    );
  });

  it("should prefer a bare repo name input over a different GITHUB_REPOSITORY env var (cross-repo targeting)", () => {
    expect(parseRepo("other-repo", "octocat/current-repo")).toBe("other-repo");
  });

  it("should accept repo with dots and underscores", () => {
    expect(parseRepo("my.repo_name", "owner/my.repo_name")).toBe(
      "my.repo_name"
    );
  });

  it("should throw error for repo with spaces", () => {
    expect(() => parseRepo("", "owner/invalid repo")).toThrow(
      ERROR_MESSAGES.INVALID_REPO_FORMAT
    );
  });

  it("should throw error for repo with special characters", () => {
    expect(() => parseRepo("", "owner/invalid@repo")).toThrow(
      ERROR_MESSAGES.INVALID_REPO_FORMAT
    );
  });

  it("should throw error when repo is empty and no env var", () => {
    expect(() => parseRepo("", undefined)).toThrow(ERROR_MESSAGES.INVALID_REPO);
  });

  it("should extract repo name from an owner/repo input (matches the github.repository default)", () => {
    expect(parseRepo("owner/repo-name", undefined)).toBe("repo-name");
  });

  it("should fall back to GITHUB_REPOSITORY env var", () => {
    expect(parseRepo("", "env-owner/env-repo")).toBe("env-repo");
  });
});

describe("parseRunsToKeep", () => {
  it("should return default when empty", () => {
    expect(parseRunsToKeep("")).toBe(DEFAULTS.RUNS_TO_KEEP);
  });

  it("should return parsed integer", () => {
    expect(parseRunsToKeep("10")).toBe(10);
  });

  it("should return 0 for '0'", () => {
    expect(parseRunsToKeep("0")).toBe(0);
  });

  it("should throw for negative value", () => {
    expect(() => parseRunsToKeep("-1")).toThrow(
      ERROR_MESSAGES.INVALID_RUNS_TO_KEEP_NEGATIVE
    );
  });

  it("should throw for non-integer", () => {
    expect(() => parseRunsToKeep("abc")).toThrow(
      ERROR_MESSAGES.INVALID_RUNS_TO_KEEP
    );
  });

  it("should throw for float", () => {
    expect(() => parseRunsToKeep("1.5")).toThrow(
      ERROR_MESSAGES.INVALID_RUNS_TO_KEEP
    );
  });

  it("should accept the maximum allowed value", () => {
    expect(parseRunsToKeep(VALIDATION_RULES.MAX_RUNS_TO_KEEP.toString())).toBe(
      VALIDATION_RULES.MAX_RUNS_TO_KEEP
    );
  });

  it("should throw for value above max", () => {
    expect(() =>
      parseRunsToKeep((VALIDATION_RULES.MAX_RUNS_TO_KEEP + 1).toString())
    ).toThrow(ERROR_MESSAGES.INVALID_RUNS_TO_KEEP_MAX);
  });
});

describe("parseRunsOlderThan", () => {
  it("should return default when empty", () => {
    expect(parseRunsOlderThan("")).toBe(DEFAULTS.RUNS_OLDER_THAN);
  });

  it("should return parsed integer", () => {
    expect(parseRunsOlderThan("30")).toBe(30);
  });

  it("should throw for negative value", () => {
    expect(() => parseRunsOlderThan("-1")).toThrow(
      ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN_NEGATIVE
    );
  });

  it("should throw for non-integer", () => {
    expect(() => parseRunsOlderThan("abc")).toThrow(
      ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN
    );
  });

  it("should accept the maximum allowed value", () => {
    expect(parseRunsOlderThan(VALIDATION_RULES.MAX_DAYS_OLD.toString())).toBe(
      VALIDATION_RULES.MAX_DAYS_OLD
    );
  });

  it("should throw for value above max", () => {
    expect(() =>
      parseRunsOlderThan((VALIDATION_RULES.MAX_DAYS_OLD + 1).toString())
    ).toThrow(ERROR_MESSAGES.INVALID_RUNS_OLDER_THAN_MAX);
  });
});

describe("parseDryRun", () => {
  it("should return false as default when empty", () => {
    expect(parseDryRun("")).toBe(DEFAULTS.DRY_RUN);
  });

  it("should return true for 'true'", () => {
    expect(parseDryRun("true")).toBe(true);
  });

  it("should return true for '1'", () => {
    expect(parseDryRun("1")).toBe(true);
  });

  it("should return true for 'yes'", () => {
    expect(parseDryRun("yes")).toBe(true);
  });

  it("should return false for 'false'", () => {
    expect(parseDryRun("false")).toBe(false);
  });

  it("should return false for '0'", () => {
    expect(parseDryRun("0")).toBe(false);
  });

  it("should return false for 'no'", () => {
    expect(parseDryRun("no")).toBe(false);
  });

  it("should throw for invalid value", () => {
    expect(() => parseDryRun("maybe")).toThrow(ERROR_MESSAGES.INVALID_DRY_RUN);
  });
});

describe("parseWorkflowNames", () => {
  it("should return empty array when empty", () => {
    expect(parseWorkflowNames("")).toEqual([]);
  });

  it("should parse comma-separated names", () => {
    expect(parseWorkflowNames("CI, Deploy, Tests")).toEqual([
      "CI",
      "Deploy",
      "Tests",
    ]);
  });

  it("should trim whitespace from names", () => {
    expect(parseWorkflowNames("  CI  ,  Deploy  ")).toEqual(["CI", "Deploy"]);
  });

  it("should accept workflow names with dots", () => {
    expect(parseWorkflowNames("Node.js CI, ci.build, Deploy")).toEqual([
      "Node.js CI",
      "ci.build",
      "Deploy",
    ]);
  });

  it("should throw for names with invalid characters", () => {
    expect(() => parseWorkflowNames("CI, Deploy@prod")).toThrow(
      ERROR_MESSAGES.INVALID_WORKFLOW_NAMES_FORMAT
    );
  });
});
