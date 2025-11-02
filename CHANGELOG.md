# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [7] - 2025-11-03

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
- **Enhanced Clean Logs Workflow**: Comprehensive test suite with 6 test scenarios
  - Basic dry run test
  - Workflow filtering test
  - Keep many runs test
  - Delete all old runs test
  - Short retention test
  - Combined features test
- **AI PR Review Workflow**: Automated code review using AI
- **Workflow Statistics**: Per-workflow deletion statistics in logs
- **CHANGELOG.md**: Complete release history documentation

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
- **Updated README**: Comprehensive documentation with all v7 features
  - Migration guide from v6 to v7
  - Advanced features documentation
  - Multiple usage examples
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

### Security

- Enhanced input validation for workflow names
- Improved error handling to prevent information leakage
- Rate limiting to prevent API abuse

## [6] - 2024-07-01

### Changed

- Updated to Node.js 20
- Dependency updates for security and compatibility
- Improved GitHub Actions workflows
- Updated to use `actions/checkout@v4`
- Code quality improvements

### Fixed

- Various bug fixes and stability improvements
- Improved error handling

## [5] - 2024-04-02

### Added

- Support for `runs_to_keep` parameter to retain N most recent runs per workflow
- Per-workflow retention logic

### Changed

- Improved workflow run filtering logic
- Better handling of workflow run pagination
- Updated dependencies

### Fixed

- Fixed issues with keeping recent runs
- Improved date filtering accuracy

## [4] - 2023-10-02

### Added

- `runs_older_than` parameter to replace deprecated `days_old`
- Better date-based filtering for workflow runs
- Improved logging and error messages

### Changed

- Refactored date handling logic
- Improved parameter naming for clarity

### Deprecated

- `days_old` parameter (use `runs_older_than` instead)

### Fixed

- Timezone handling improvements
- Edge cases in date calculations

## [3.0.1] - 2022-11-09

### Fixed

- Bug fixes for workflow run deletion
- Improved error handling for API failures
- Fixed edge cases in pagination

## [3] - 2022-08-17

### Added

- GitHub Actions workflow automation
- Batch deletion support for better performance
- Pagination support for large repositories

### Changed

- Improved API request handling
- Better progress reporting
- Optimized deletion process

### Fixed

- Fixed issues with large numbers of workflow runs
- Improved rate limiting handling

## [2] - 2022-07-02

### Added

- TypeScript support
- Comprehensive test suite with Jest
- ESLint and Prettier configuration
- GitHub Actions workflows for CI/CD

### Changed

- Complete TypeScript rewrite
- Improved code organization
- Better error messages
- Enhanced type safety

### Fixed

- Various bug fixes from v1
- Improved stability

## [1] - 2022-05-17

### Added

- Initial release
- Basic workflow run deletion functionality
- `days_old` parameter for filtering runs
- GitHub token authentication
- Repository owner and name parameters

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

### From v5 to v6

- Update Node.js to version 20 or higher
- Review and update any deprecated dependencies in your workflows

### From v4 to v5

- The `runs_to_keep` parameter is now available for per-workflow retention
- No breaking changes

### From v3 to v4

- Replace `days_old` with `runs_older_than` parameter
- Same functionality, just renamed for clarity

### From v2 to v3

- No breaking changes
- Benefits from improved pagination and performance

### From v1 to v2

- TypeScript rewrite - no user-facing changes
- Better error messages and type safety

[7]: https://github.com/igorjs/gh-actions-clean-workflow/compare/v6...v7
[6]: https://github.com/igorjs/gh-actions-clean-workflow/compare/v5...v6
[5]: https://github.com/igorjs/gh-actions-clean-workflow/compare/v4...v5
[4]: https://github.com/igorjs/gh-actions-clean-workflow/compare/v3.0.1...v4
[3.0.1]: https://github.com/igorjs/gh-actions-clean-workflow/compare/v3...v3.0.1
[3]: https://github.com/igorjs/gh-actions-clean-workflow/compare/v2...v3
[2]: https://github.com/igorjs/gh-actions-clean-workflow/compare/v1...v2
[1]: https://github.com/igorjs/gh-actions-clean-workflow/releases/tag/v1
