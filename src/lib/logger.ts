// SPDX-License-Identifier: MIT
/**
 * Standardized logging utility
 */

import { formatMetricsLines } from "#src/core/logger";
import type { ApiMetrics } from "#src/types";

const LOG_PREFIX = {
  INFO: "INFO:",
  WARN: "WARN:",
  ERROR: "ERROR:",
  SUCCESS: "SUCCESS:",
  DRY_RUN: "DRY RUN:",
} as const;

/**
 * Log informational message
 */
export function info(message: string): void {
  console.info(`${LOG_PREFIX.INFO} ${message}`);
}

/**
 * Log warning message
 */
export function warn(message: string): void {
  console.warn(`${LOG_PREFIX.WARN} ${message}`);
}

/**
 * Log error message
 */
export function error(message: string): void {
  console.error(`${LOG_PREFIX.ERROR} ${message}`);
}

/**
 * Log success message
 */
export function success(message: string): void {
  console.info(`${LOG_PREFIX.SUCCESS} ${message}`);
}

/**
 * Log dry-run message
 */
export function dryRun(message: string): void {
  console.info(`${LOG_PREFIX.DRY_RUN} ${message}`);
}

/**
 * Log API metrics summary
 */
export function metrics(m: ApiMetrics): void {
  for (const line of formatMetricsLines(m)) info(line);
}
