# Clean Workflow Action

[![CI](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/ci.yml) [![Check Dist](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/check-dist.yml/badge.svg)](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/check-dist.yml) [![codecov](https://codecov.io/gh/igorjs/gh-actions-clean-workflow/graph/badge.svg?token=SvXR0ZFpvg)](https://codecov.io/gh/igorjs/gh-actions-clean-workflow)

Clean workflow run logs based on configuration with advanced features like retry logic, circuit breaker, rate limiting, and workflow filtering.

## Features

- 🎯 **Workflow Filtering**: Filter deletions by specific workflow names
- 🔄 **Automatic Retries**: Exponential backoff retry logic for transient failures
- 🛡️ **Circuit Breaker**: Prevents cascading failures with automatic recovery
- ⏱️ **Rate Limiting**: Built-in API rate limit handling with retry-after support
- 📊 **Detailed Metrics**: Comprehensive API metrics exported as action outputs
- 🧪 **Dry Run Mode**: Test your configuration without actually deleting runs
- 📈 **High Test Coverage**: Over 95% code coverage with unit and integration tests
- ⚡ **Modern Tooling**: Built with TypeScript, Biome.js, and Vitest

## Usage

Please be aware of the GitHub's API [rate limit](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

### Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `token` | GitHub token for API access | `github.token` | No |
| `owner` | Repository owner | `github.repository_owner` | No |
| `repo` | Repository name | Extracted from `github.repository` | No |
| `runs_older_than` | Days old for a workflow run to be considered old | `7` | No |
| `runs_to_keep` | Number of latest workflow runs to keep per workflow | `0` | No |
| `workflow_names` | Comma-separated list of workflow names to filter (empty = all workflows) | `""` | No |
| `dry_run` | Preview deletions without actually deleting | `false` | No |

### Outputs

| Output | Description |
|--------|-------------|
| `total-runs-found` | Total number of workflow runs found |
| `runs-deleted` | Number of runs successfully deleted |
| `runs-failed` | Number of runs that failed to delete |
| `total-api-requests` | Total number of API requests made |
| `successful-requests` | Number of successful API requests |
| `failed-requests` | Number of failed API requests |
| `retry-attempts` | Number of retry attempts |
| `rate-limit-hits` | Number of times rate limit was hit |
| `circuit-breaker-trips` | Number of times circuit breaker opened |

### Permissions

This workflow needs write permissions on your actions.
Be sure to add the correct permissions as follows:

```yaml
permissions:
  actions: write
```

### Examples

#### Basic Usage

```yaml
jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v7
        with:
          token: ${{ github.token }} # optional
          owner: ${{ github.repository_owner }} # optional
          repo: ${{ github.repository }} # optional
          runs_older_than: 7 # optional
          runs_to_keep: 0 # optional
```

#### Filter by Workflow Names

Clean only specific workflows by name:

```yaml
jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v7
        with:
          workflow_names: "CI, Tests, Deploy" # Only clean these workflows
          runs_older_than: 14
          runs_to_keep: 5
```

#### Dry Run Mode

Preview what would be deleted without actually deleting:

```yaml
jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v7
        with:
          dry_run: true # Preview mode
          runs_older_than: 7
```

#### Using Metrics Outputs

Use the exported metrics for monitoring or alerting:

```yaml
jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - name: Clean workflow runs
        id: clean
        uses: igorjs/gh-actions-clean-workflow@v7
        with:
          runs_older_than: 7
          runs_to_keep: 10

      - name: Display metrics
        run: |
          echo "Total runs found: ${{ steps.clean.outputs.total-runs-found }}"
          echo "Runs deleted: ${{ steps.clean.outputs.runs-deleted }}"
          echo "Runs failed: ${{ steps.clean.outputs.runs-failed }}"
          echo "API requests: ${{ steps.clean.outputs.total-api-requests }}"
          echo "Rate limit hits: ${{ steps.clean.outputs.rate-limit-hits }}"
```

#### Manual Trigger

```yaml
name: Clean Workflow Logs

on:
  workflow_dispatch:
    inputs:
      runs_older_than:
        description: "The amount of days old to delete"
        default: "7"
        required: false
      runs_to_keep:
        description: "The amount of latest workflows runs to keep"
        default: "0"
        required: false
      workflow_names:
        description: "Comma-separated workflow names (empty = all)"
        default: ""
        required: false
      dry_run:
        description: "Dry run mode (preview only)"
        type: boolean
        default: false
        required: false

jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v7
        with:
          runs_older_than: ${{ github.event.inputs.runs_older_than }}
          runs_to_keep: ${{ github.event.inputs.runs_to_keep }}
          workflow_names: ${{ github.event.inputs.workflow_names }}
          dry_run: ${{ github.event.inputs.dry_run }}
```

#### Scheduled Trigger

```yaml
name: Clean Workflow Logs

on:
  schedule:
    - cron: "0 0 * * 1"  # Runs "At 00:00 on Monday." (see https://crontab.guru)

jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v7
        with:
          runs_older_than: "14"
          runs_to_keep: "20"
```

#### Both Manual and Scheduled Triggers

```yaml
name: Clean Workflow Logs

on:
  schedule:
    - cron: "0 0 * * 1"  # Runs "At 00:00 on Monday." (see https://crontab.guru)

  workflow_dispatch:
    inputs:
      runs_older_than:
        description: "The amount of days old to delete"
        default: "7"
        required: false
      dry_run:
        description: "Dry run mode"
        type: boolean
        default: false
        required: false

env:
  SCHEDULED_RUNS_OLDER_THAN: "7"
  SCHEDULED_RUNS_TO_KEEP: "20"

jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v7
        with:
          runs_older_than: ${{ github.event.inputs.runs_older_than || env.SCHEDULED_RUNS_OLDER_THAN }}
          runs_to_keep: ${{ github.event.inputs.runs_to_keep || env.SCHEDULED_RUNS_TO_KEEP }}
          dry_run: ${{ github.event.inputs.dry_run || false }}
```

## Advanced Features

### Retry Logic

The action automatically retries failed API requests with exponential backoff:
- Maximum 3 retry attempts
- Exponential backoff: 1s, 2s, 4s
- Retries on: 5xx errors, rate limits (429), network failures
- No retries on: 4xx client errors (except 429)

### Circuit Breaker

Prevents cascading failures and API abuse:
- Opens after 5 consecutive failures
- Automatically recovers after 60 seconds
- Transitions through CLOSED → OPEN → HALF_OPEN states
- Metrics tracked via `circuit-breaker-trips` output

### Rate Limiting

Built-in rate limit handling:
- Respects GitHub API rate limits
- Honors `Retry-After` headers
- 100ms delay between deletions
- Metrics tracked via `rate-limit-hits` output

### Workflow Filtering

Filter deletions to specific workflows:
- Comma-separated workflow names
- Case-sensitive matching
- Supports alphanumeric, spaces, dashes, and underscores
- Example: `workflow_names: "CI, Deploy, Tests"`

## Development

### Prerequisites

- Node.js >= 24.0.0
- npm >= 10.0.0

### Setup

```bash
npm install
```

### Commands

```bash
npm run check         # Run Biome linting and formatting checks
npm run check:fix     # Auto-fix Biome issues
npm run test          # Run tests
npm run test:coverage # Run tests with coverage report
npm run build         # Build the action
npm run all           # Run all checks, tests, and build
```

### Testing

The project has comprehensive test coverage (98.93%):
- 113 tests across 4 test suites
- Unit tests for all components
- Integration tests for API interactions
- Circuit breaker state transition tests
- Retry logic and error handling tests

## Migration Guide

### From v6 to v7

v7 is a major version with breaking changes and new features:

**Breaking Changes:**
- Minimum Node.js version increased to 24.0.0
- Migrated from ESLint + Prettier to Biome.js
- Logger class converted to individual functions (internal)

**New Features:**
- Workflow filtering via `workflow_names` parameter
- Dry run mode via `dry_run` parameter
- 9 new metric outputs for monitoring
- Circuit breaker pattern for fault tolerance
- Automatic retry with exponential backoff
- Rate limit handling with retry-after support

**Migration:**
```yaml
# Old (v6)
- uses: igorjs/gh-actions-clean-workflow@v6
  with:
    runs_older_than: 7

# New (v7)
- uses: igorjs/gh-actions-clean-workflow@v7
  with:
    runs_older_than: 7
    # Optional new features:
    workflow_names: "CI, Deploy"  # Filter by workflows
    dry_run: false                # Dry run mode
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/igorjs/gh-actions-clean-workflow/issues).
