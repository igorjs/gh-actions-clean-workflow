// SPDX-License-Identifier: MIT
import type { Api } from "#src/lib/api";
import { makeDefaultEnv, type RunEnv } from "#src/lib/env";
import * as logger from "#src/lib/logger";
import {
  exportMetrics,
  logWorkflowStats,
  ZERO_METRICS,
} from "#src/lib/reporting";
import { createRunReporter, type RunReporter } from "#src/lib/run-reporter";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function run(env: RunEnv = makeDefaultEnv()): Promise<void> {
  const { params, getApi, setFailed: fail, setOutput: setOut } = env;
  let api: Api | undefined;
  try {
    const token = params.getToken();
    const owner = params.getOwner();
    const repo = params.getRepo();
    const runsToKeep = params.getRunsToKeep();
    const olderThanDays = params.getRunsOlderThan();
    const dryRun = params.getDryRun();
    const workflowNames = params.getWorkflowNames();
    const reporter: RunReporter = createRunReporter(dryRun);

    reporter.announce();
    if (workflowNames.length > 0)
      logger.info(`Filtering by workflows: ${workflowNames.join(", ")}`);

    api = getApi({ token, owner, repo, dryRun, workflowNames });

    logger.info(`Fetching workflow runs for ${owner}/${repo}...`);
    const { runIds, totalRuns, workflowStats } = await api.getRunsToDelete(
      olderThanDays,
      runsToKeep
    );

    logger.info(`Found ${totalRuns} runs older than ${olderThanDays} days`);

    if (runIds.length === 0) {
      logger.info("No runs to delete");
      const metrics = api.getMetrics();
      logger.metrics(metrics);
      exportMetrics(totalRuns, 0, 0, metrics, setOut);
      return;
    }

    logWorkflowStats(
      workflowStats,
      runsToKeep,
      reporter.describeWorkflowAction()
    );

    logger.info(
      `${reporter.describeBatchAction()} ${runIds.length} total runs across all workflows...`
    );

    const { failed, succeeded } = await api.deleteRuns(runIds);

    reporter.reportOutcome(succeeded);

    if (failed > 0) logger.warn(`Failed to delete ${failed} runs`);

    const metrics = api.getMetrics();
    logger.metrics(metrics);
    exportMetrics(totalRuns, succeeded, failed, metrics, setOut);

    if (reporter.shouldFailOnErrors(failed)) {
      fail(
        `Failed to delete ${failed} out of ${runIds.length} runs. Check logs for details.`
      );
    }
  } catch (err) {
    const message = toErrorMessage(err);
    logger.error(message);
    exportMetrics(0, 0, 0, api?.getMetrics() ?? ZERO_METRICS, setOut);
    fail(message);
  }
}
