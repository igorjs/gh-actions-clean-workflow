// SPDX-License-Identifier: MIT
import * as logger from "./logger";

export interface RunReporter {
  announce(): void;
  describeBatchAction(): string;
  describeWorkflowAction(): string;
  reportOutcome(succeeded: number): void;
  shouldFailOnErrors(failed: number): boolean;
}

// Picks the announce/wording/outcome/failure-gate behavior once from
// `dryRun`, instead of checking the flag at every log statement and branch
// in index.ts's run().
export function createRunReporter(dryRun: boolean): RunReporter {
  if (dryRun) {
    return {
      announce() {
        logger.info("DRY RUN MODE - No runs will be actually deleted");
      },
      describeBatchAction: () => "Would delete",
      describeWorkflowAction: () => "would delete",
      reportOutcome(succeeded) {
        logger.dryRun(`Would have deleted ${succeeded} runs`);
      },
      shouldFailOnErrors: () => false,
    };
  }

  return {
    announce() {
      // No-op: nothing to announce for a real run.
    },
    describeBatchAction: () => "Deleting",
    describeWorkflowAction: () => "deleting",
    reportOutcome(succeeded) {
      logger.success(`Deleted ${succeeded} runs`);
    },
    shouldFailOnErrors: (failed) => failed > 0,
  };
}
