// SPDX-License-Identifier: MIT
import { setTimeout as nodeSetTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { getInput, setFailed, setOutput } from "@actions/core";
import { getOctokit } from "@actions/github";
import type { ApiMetrics, RunEnv } from "./config/types";
import { makeApi } from "./lib/api";
import * as logger from "./lib/logger";
import { makeParams } from "./lib/params";

function exportMetrics(
  totalRuns: number,
  succeeded: number,
  failed: number,
  metrics: ApiMetrics,
  setOut: (name: string, value: string) => void
): void {
  setOut("total-runs-found", totalRuns.toString());
  setOut("runs-deleted", succeeded.toString());
  setOut("runs-failed", failed.toString());
  setOut("total-api-requests", metrics.totalRequests.toString());
  setOut("successful-requests", metrics.successfulRequests.toString());
  setOut("failed-requests", metrics.failedRequests.toString());
  setOut("retry-attempts", metrics.retries.toString());
  setOut("rate-limit-hits", metrics.rateLimitHits.toString());
  setOut("circuit-breaker-trips", metrics.circuitBreakerTrips.toString());
}

function logWorkflowStats(
  workflowStats: Map<number, { total: number; toDelete: number }>,
  runsToKeep: number,
  dryRun: boolean
): void {
  if (runsToKeep > 0 && workflowStats.size > 0) {
    for (const [workflowId, stats] of workflowStats) {
      if (stats.toDelete > 0) {
        const action = dryRun ? "would delete" : "deleting";
        logger.info(
          `Workflow ${workflowId}: keeping ${
            stats.total - stats.toDelete
          } runs, ${action} ${stats.toDelete} runs`
        );
      }
    }
  }
}

function makeDefaultEnv(): RunEnv {
  return {
    params: makeParams({ getInput }),
    getApi: makeApi({ getOctokit, sleep: nodeSetTimeout, now: Date.now }),
    setFailed,
    setOutput,
  };
}

export async function run(env: RunEnv = makeDefaultEnv()): Promise<void> {
  const { params, getApi, setFailed: fail, setOutput: setOut } = env;
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

    const api = getApi({ token, owner, repo, dryRun, workflowNames });

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
    console.error(err);
    fail((err as Error).message);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
