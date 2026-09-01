// SPDX-License-Identifier: MIT
import type { Sleep } from "#src/types";
import * as logger from "./logger";

export interface DeletionMode {
  execute(id: number, deleteRun: () => Promise<void>): Promise<void>;
  paceBatch(delayMs: number): Promise<void>;
}

// No API call happens in dry-run mode, but keeping a pacing delay gives
// users previewing a dry run a realistic sense of how long the real
// deletion run will take.
export const DRY_RUN_SIMULATED_DELAY_MS = 100;

// Picks the delete/pace behavior once from `dryRun`, instead of checking the
// flag at every call site in deleteRunById/deleteRuns.
export function createDeletionMode(
  dryRun: boolean,
  sleep: Sleep
): DeletionMode {
  if (dryRun) {
    return {
      async execute(id) {
        logger.dryRun(`Would delete run #${id}`);
        await sleep(DRY_RUN_SIMULATED_DELAY_MS);
      },
      async paceBatch() {
        // No-op: no real API calls were made, nothing to pace between batches.
      },
    };
  }

  return {
    async execute(_id, deleteRun) {
      await deleteRun();
    },
    async paceBatch(delayMs) {
      await sleep(delayMs);
    },
  };
}
