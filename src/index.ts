// SPDX-License-Identifier: MIT
import { setTimeout as nodeSetTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { getInput, setFailed, setOutput, setSecret } from "@actions/core";
import { getOctokit } from "@actions/github";
import type { Api, ApiMetrics, RunEnv } from "#src/config/types";
import {
  computeOutputs,
  computeWorkflowStatsMessages,
} from "#src/core/reporting";
import { makeApi } from "#src/lib/api";
import * as logger from "#src/lib/logger";
import { makeParams } from "#src/lib/params";

const ZERO_METRICS: ApiMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  retries: 0,
  rateLimitHits: 0,
  circuitBreakerTrips: 0,
};

function exportMetrics(
  totalRuns: number,
  succeeded: number,
  failed: number,
  metrics: ApiMetrics,
  setOut: (name: string, value: string) => void
): void {
  for (const [name, value] of Object.entries(
    computeOutputs(totalRuns, succeeded, failed, metrics)
  ))
    setOut(name, value);
}

function logWorkflowStats(
  workflowStats: Map<number, { total: number; toDelete: number }>,
  runsToKeep: number,
  dryRun: boolean
): void {
  for (const msg of computeWorkflowStatsMessages(
    workflowStats,
    runsToKeep,
    dryRun
  ))
    logger.info(msg);
}

function makeDefaultEnv(): RunEnv {
  return {
    params: makeParams({ getInput, setSecret }),
    getApi: makeApi({ getOctokit, sleep: nodeSetTimeout, now: Date.now }),
    setFailed,
    setOutput,
  };
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

    if (dryRun) logger.info("DRY RUN MODE - No runs will be actually deleted");
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

    logWorkflowStats(workflowStats, runsToKeep, dryRun);

    const action = dryRun ? "Would delete" : "Deleting";
    logger.info(
      `${action} ${runIds.length} total runs across all workflows...`
    );

    const { failed, succeeded } = await api.deleteRuns(runIds);

    if (dryRun) logger.dryRun(`Would have deleted ${succeeded} runs`);
    else logger.success(`Deleted ${succeeded} runs`);

    if (failed > 0) logger.warn(`Failed to delete ${failed} runs`);

    const metrics = api.getMetrics();
    logger.metrics(metrics);
    exportMetrics(totalRuns, succeeded, failed, metrics, setOut);

    if (failed > 0 && !dryRun) {
      fail(
        `Failed to delete ${failed} out of ${runIds.length} runs. Check logs for details.`
      );
    }
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    exportMetrics(0, 0, 0, api?.getMetrics() ?? ZERO_METRICS, setOut);
    fail(err instanceof Error ? err.message : String(err));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
