/**
 * Standardized logging utility
 */

import { LOG_PREFIX } from "../config/constants";

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
export function metrics(metrics: {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retries: number;
  rateLimitHits: number;
  circuitBreakerTrips: number;
}): void {
  info("=== API Metrics ===");
  info(`Total API requests: ${metrics.totalRequests}`);
  info(`Successful requests: ${metrics.successfulRequests}`);
  info(`Failed requests: ${metrics.failedRequests}`);
  info(`Retry attempts: ${metrics.retries}`);
  info(`Rate limit hits: ${metrics.rateLimitHits}`);
  info(`Circuit breaker trips: ${metrics.circuitBreakerTrips}`);
  info("==================");
}
