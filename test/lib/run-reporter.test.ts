// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRunReporter } from "#src/lib/run-reporter";

describe("createRunReporter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("real mode (dryRun: false)", () => {
    const reporter = createRunReporter(false);

    it("announce() does not log anything", () => {
      // Arrange
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      // Act
      reporter.announce();

      // Assert
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it("describeBatchAction() returns the capitalized present-tense verb", () => {
      expect(reporter.describeBatchAction()).toBe("Deleting");
    });

    it("describeWorkflowAction() returns the lowercase present-tense verb", () => {
      expect(reporter.describeWorkflowAction()).toBe("deleting");
    });

    it("reportOutcome() logs a success message", () => {
      // Arrange
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      // Act
      reporter.reportOutcome(5);

      // Assert
      expect(infoSpy).toHaveBeenCalledWith("SUCCESS: Deleted 5 runs");
    });

    it.each([
      { failed: 0, expected: false },
      { failed: 1, expected: true },
      { failed: 5, expected: true },
    ])("shouldFailOnErrors($failed) is $expected", ({ failed, expected }) => {
      expect(reporter.shouldFailOnErrors(failed)).toBe(expected);
    });
  });

  describe("dry-run mode (dryRun: true)", () => {
    const reporter = createRunReporter(true);

    it("announce() logs the dry-run banner", () => {
      // Arrange
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      // Act
      reporter.announce();

      // Assert
      expect(infoSpy).toHaveBeenCalledWith(
        "INFO: DRY RUN MODE - No runs will be actually deleted"
      );
    });

    it("describeBatchAction() returns the capitalized dry-run verb", () => {
      expect(reporter.describeBatchAction()).toBe("Would delete");
    });

    it("describeWorkflowAction() returns the lowercase dry-run verb", () => {
      expect(reporter.describeWorkflowAction()).toBe("would delete");
    });

    it("reportOutcome() logs a dry-run message", () => {
      // Arrange
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      // Act
      reporter.reportOutcome(5);

      // Assert
      expect(infoSpy).toHaveBeenCalledWith(
        "DRY RUN: Would have deleted 5 runs"
      );
    });

    it.each([
      { failed: 0, expected: false },
      { failed: 1, expected: false },
      { failed: 5, expected: false },
    ])(
      "shouldFailOnErrors($failed) is always false",
      ({ failed, expected }) => {
        expect(reporter.shouldFailOnErrors(failed)).toBe(expected);
      }
    );
  });
});
