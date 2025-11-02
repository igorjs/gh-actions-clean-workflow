# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [7] - 2025-01-03

### Added

- **Workflow Filtering**: New `workflow_names` parameter to filter deletions by specific workflow names (comma-separated)
- **Dry Run Mode**: New `dry_run` parameter to preview deletions without actually deleting runs
- **Metrics Outputs**: 9 new action outputs for monitoring and alerting:
  - `total-runs-found`: Total number of workflow runs found
  - `runs-deleted`: Number of runs successfully deleted
  - `runs-failed`: Number of runs that failed to delete
  - `total-api-requests`: Total number of API requests made
  - `successful-requests`: Number of successful API requests
  - `failed-requests`: Number of failed API requests
  - `retry-attempts`: Number of retry attempts
  - `rate-limit-hits`: Number of times rate limit was hit
  - `circuit-breaker-trips`: Number of times circuit breaker opened
- **Circuit Breaker Pattern**: Prevents cascading failures with automatic recovery
  - Opens after 5 consecutive failures
  - Automatically recovers after 60 seconds
  - Transitions through CLOSED → OPEN → HALF_OPEN states
- **Automatic Retry Logic**: Exponential backoff retry for transient failures
  - Maximum 3 retry attempts
  - Exponential backoff: 1s, 2s, 4s
  - Retries on 5xx errors, rate limits (429), and network failures
  - No retries on 4xx client errors (except 429)
- **Rate Limit Handling**: Built-in GitHub API rate limit support
  - Respects `Retry-After` headers
  - 100ms delay between deletions
  - Automatic retry on rate limit errors
- **Comprehensive Test Suite**: Increased test coverage from ~70% to 98.93%
  - 113 tests across 4 test suites
  - Circuit breaker state transition tests
  - Retry logic and error handling tests
  - Workflow filtering tests
  - Parameter validation tests
- **AI PR Review Workflow**: Automated code review using AI
- **Workflow Statistics**: Per-workflow deletion statistics in logs

### Changed

- **Migrated to Biome.js**: Replaced ESLint + Prettier with Biome for faster linting and formatting
  - ~119 fewer dependencies
  - Single tool for linting and formatting
  - Faster execution (Rust-based)
- **Migrated to Vitest**: Replaced Jest with Vitest for modern testing
  - Faster test execution
  - Better TypeScript support
  - Native ESM support
- **Refactored Error Handling**: Removed Result monad pattern for simpler, direct error handling
  - Improved TypeScript type safety
  - Clearer error messages
  - Better stack traces
- **Enhanced Logging**: Improved log output with structured information
  - Per-workflow statistics
  - Detailed deletion progress
  - Clear dry-run indicators
  - Comprehensive metrics summary
- **Modular Architecture**: Split `api.ts` into smaller, focused modules
  - `circuit-breaker.ts`: Circuit breaker implementation
  - `retry.ts`: Retry logic with exponential backoff
  - `logger.ts`: Centralized logging functions
  - Organized into `src/config/` and `src/lib/` folders
- **Parameter Validation**: Enhanced input validation with better error messages
  - Workflow name validation (alphanumeric, spaces, dashes, underscores)
  - Comprehensive range checking
  - Clear error messages with parameter names
- **Updated Dependencies**: Major dependency updates
  - `@types/node`: 22.16.0 → 24.9.2
  - `@octokit/types`: 14.1.0 → 16.0.0
  - `actions/setup-node`: v4 → v6
  - `codecov/codecov-action`: v4 → v5
  - TypeScript 5.9.3
  - And many more development dependencies

### Breaking Changes

- **Minimum Node.js version**: Increased to 24.0.0 (from 20.x)
- **Tooling Migration**: Migrated from ESLint + Prettier to Biome.js
  - Development workflow changes for contributors
  - New npm scripts: `check`, `check:fix` instead of `lint` and `format`
- **Internal API Changes**: Logger class converted to individual functions (internal API only)

### Fixed

- Improved error handling for API failures
- Better circuit breaker state management
- Fixed retry logic edge cases
- Enhanced parameter validation edge cases

### Documentation

- Completely updated README with all v7 features
- Added migration guide from v6 to v7
- Added advanced features documentation (retry, circuit breaker, rate limiting)
- Added comprehensive usage examples
- Added development setup instructions
- Added test coverage badge and statistics
- Updated all examples to use `@v7`

### Development

- Added comprehensive test coverage (98.93%)
- Added circuit breaker tests (100% coverage)
- Added workflow filtering tests
- Added parameter validation tests
- Added error handling tests
- Improved CI/CD workflows
- Added stale issue management
- Updated GitHub Actions workflow versions

## [6] - Previous Release

See previous releases for v6.x.x changes.

---

## Upgrading

### From v6 to v7

**Breaking Changes:**
- Update your Node.js version to 24.0.0 or higher
- If contributing, migrate from ESLint/Prettier to Biome.js

**New Features (Optional):**
```yaml
# Before (v6)
- uses: igorjs/gh-actions-clean-workflow@v6
  with:
    runs_older_than: 7

# After (v7) - with new features
- uses: igorjs/gh-actions-clean-workflow@v7
  with:
    runs_older_than: 7
    workflow_names: "CI, Deploy"  # Optional: Filter specific workflows
    dry_run: false                # Optional: Dry run mode
```

**Using Metrics:**
```yaml
- name: Clean workflow runs
  id: clean
  uses: igorjs/gh-actions-clean-workflow@v7
  with:
    runs_older_than: 7

- name: Check metrics
  run: |
    echo "Deleted: ${{ steps.clean.outputs.runs-deleted }}"
    echo "Failed: ${{ steps.clean.outputs.runs-failed }}"
```

[7]: https://github.com/igorjs/gh-actions-clean-workflow/compare/v6...v7
[6]: https://github.com/igorjs/gh-actions-clean-workflow/releases/tag/v6
