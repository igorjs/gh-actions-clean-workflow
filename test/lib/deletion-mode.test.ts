// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  createDeletionMode,
  DRY_RUN_SIMULATED_DELAY_MS,
} from "#src/lib/deletion-mode";

describe("createDeletionMode", () => {
  describe("real mode (dryRun: false)", () => {
    it("execute() calls the passed deleteRun function", async () => {
      // Arrange
      const sleep = vi.fn().mockResolvedValue(undefined);
      const mode = createDeletionMode(false, sleep);
      const deleteRun = vi.fn().mockResolvedValue(undefined);

      // Act
      await mode.execute(1, deleteRun);

      // Assert
      expect(deleteRun).toHaveBeenCalledTimes(1);
    });

    it("execute() propagates a rejection from deleteRun", async () => {
      // Arrange
      const sleep = vi.fn().mockResolvedValue(undefined);
      const mode = createDeletionMode(false, sleep);
      const error = new Error("boom");
      const deleteRun = vi.fn().mockRejectedValue(error);

      // Act & Assert
      await expect(mode.execute(1, deleteRun)).rejects.toThrow("boom");
    });

    it("paceBatch() calls sleep with the given delay", async () => {
      // Arrange
      const sleep = vi.fn().mockResolvedValue(undefined);
      const mode = createDeletionMode(false, sleep);

      // Act
      await mode.paceBatch(500);

      // Assert
      expect(sleep).toHaveBeenCalledWith(500);
    });
  });

  describe("dry-run mode (dryRun: true)", () => {
    it("execute() does not call deleteRun", async () => {
      // Arrange
      const sleep = vi.fn().mockResolvedValue(undefined);
      const mode = createDeletionMode(true, sleep);
      const deleteRun = vi.fn().mockResolvedValue(undefined);

      // Act
      await mode.execute(1, deleteRun);

      // Assert
      expect(deleteRun).not.toHaveBeenCalled();
    });

    it("execute() logs the exact dry-run message for the given id", async () => {
      // Arrange
      const sleep = vi.fn().mockResolvedValue(undefined);
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const mode = createDeletionMode(true, sleep);

      // Act
      await mode.execute(42, vi.fn());

      // Assert
      expect(infoSpy).toHaveBeenCalledWith("DRY RUN: Would delete run #42");
      infoSpy.mockRestore();
    });

    it("execute() paces with a deliberate 100ms delay", async () => {
      // Arrange
      const sleep = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(console, "info").mockImplementation(() => {});
      const mode = createDeletionMode(true, sleep);

      // Act
      await mode.execute(1, vi.fn());

      // Assert
      expect(sleep).toHaveBeenCalledWith(DRY_RUN_SIMULATED_DELAY_MS);
      vi.restoreAllMocks();
    });

    it("paceBatch() never calls sleep", async () => {
      // Arrange
      const sleep = vi.fn().mockResolvedValue(undefined);
      const mode = createDeletionMode(true, sleep);

      // Act
      await mode.paceBatch(500);

      // Assert
      expect(sleep).not.toHaveBeenCalled();
    });
  });
});
