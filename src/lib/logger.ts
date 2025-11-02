/**
 * Standardized logging utility
 */

import { LOG_PREFIX } from "../config/constants";

/**
 * Logger class for consistent log formatting across the application
 */
export class Logger {
  /**
   * Log informational message
   */
  static info(message: string): void {
    console.info(`${LOG_PREFIX.INFO} ${message}`);
  }

  /**
   * Log warning message
   */
  static warn(message: string): void {
    console.warn(`${LOG_PREFIX.WARN} ${message}`);
  }

  /**
   * Log error message
   */
  static error(message: string): void {
    console.error(`${LOG_PREFIX.ERROR} ${message}`);
  }

  /**
   * Log success message
   */
  static success(message: string): void {
    console.info(`${LOG_PREFIX.SUCCESS} ${message}`);
  }

  /**
   * Log dry-run message
   */
  static dryRun(message: string): void {
    console.info(`${LOG_PREFIX.DRY_RUN} ${message}`);
  }

  /**
   * Log API metrics summary
   */
  static metrics(metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    retries: number;
    rateLimitHits: number;
    circuitBreakerTrips: number;
  }): void {
    Logger.info("=== API Metrics ===");
    Logger.info(`Total API requests: ${metrics.totalRequests}`);
    Logger.info(`Successful requests: ${metrics.successfulRequests}`);
    Logger.info(`Failed requests: ${metrics.failedRequests}`);
    Logger.info(`Retry attempts: ${metrics.retries}`);
    Logger.info(`Rate limit hits: ${metrics.rateLimitHits}`);
    Logger.info(`Circuit breaker trips: ${metrics.circuitBreakerTrips}`);
    Logger.info("==================");
  }
}
