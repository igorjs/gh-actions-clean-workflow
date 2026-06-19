# Clean Workflow Action

> Delete old GitHub Actions workflow runs with retry logic, circuit breaker, rate-limit awareness, and per-workflow filtering. Built for repos that generate a lot of CI noise.

[![CI](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/ci.yml/badge.svg)](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/ci.yml)
[![Check Dist](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/check-dist.yml/badge.svg)](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/check-dist.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/igorjs/gh-actions-clean-workflow/gh-pages/badges/coverage.json)](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/coverage-badge.yml)
[![OpenSSF Scorecard](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/scorecard.yml/badge.svg)](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/scorecard.yml)
[![Marketplace](https://img.shields.io/badge/Marketplace-Clean%20Workflow%20Action-blue?logo=github)](https://github.com/marketplace/actions/clean-workflow-action)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A526-brightgreen.svg)](package.json)

## Quick start

```yaml
- uses: igorjs/gh-actions-clean-workflow@v7
  with:
    runs_older_than: 7  # delete runs older than 7 days
    runs_to_keep: 5     # keep the 5 most recent runs per workflow
```

Need a full workflow file you can drop in? See [Examples](#examples) below.

## Table of contents

- [Features](#features)
- [Inputs](#inputs)
- [Outputs](#outputs)
- [Permissions](#permissions)
- [Examples](#examples)
- [Advanced behavior](#advanced-behavior)
- [Versioning](#versioning)
- [Development](#development)
- [Migrating from v6](#migrating-from-v6)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Features

- **Workflow filtering** by name, so you only touch the runs you want
- **Per-workflow retention** via `runs_to_keep` (keep the N most recent per workflow, delete the rest)
- **Automatic retries** with exponential backoff on transient failures (5xx, 429, network)
- **Circuit breaker** that opens after repeated failures and recovers automatically
- **Rate-limit aware**: respects GitHub's `Retry-After` header and paces requests
- **Dry run mode** to preview deletions without touching anything
- **Detailed metrics** exposed as action outputs for monitoring, alerting, or dashboards
- **Hardened CI**: signed commits, pinned action SHAs, OSV + Socket + CodeQL + betterleaks scanning

## Inputs

| Input | Description | Default | Required |
|---|---|---|---|
| `token` | GitHub token used for the REST API. Needs `actions: write` on the target repo. | `${{ github.token }}` | No |
| `owner` | Repository owner. | `${{ github.repository_owner }}` | No |
| `repo` | Repository name. | extracted from `${{ github.repository }}` | No |
| `runs_older_than` | Delete runs older than this many days (since the last rerun). | `7` | No |
| `runs_to_keep` | Keep this many most-recent runs **per workflow**. Set to `0` to delete every eligible run. | `0` | No |
| `workflow_names` | Comma-separated workflow names to filter. Empty = all workflows. Case-sensitive. | `""` | No |
| `dry_run` | If `true`, log what would be deleted but don't call the delete API. | `false` | No |

## Outputs

| Output | Description |
|---|---|
| `total-runs-found` | Total runs matched by the filter |
| `runs-deleted` | Runs successfully deleted |
| `runs-failed` | Runs that failed to delete |
| `total-api-requests` | Total API calls (list + delete + retries) |
| `successful-requests` | API calls that returned 2xx |
| `failed-requests` | API calls that ultimately failed |
| `retry-attempts` | Retry attempts across the run |
| `rate-limit-hits` | Times a 429 / secondary rate limit was observed |
| `circuit-breaker-trips` | Times the circuit opened to back off |

## Permissions

The workflow that calls this action needs `actions: write` on the target repository so the GitHub API can delete runs.

```yaml
permissions:
  actions: write
```

If the default `GITHUB_TOKEN` doesn't have enough scope (cross-repo cleanups, org-wide policies, ...), pass a PAT explicitly via the `token` input.

## Examples

### Basic, scheduled cleanup

Run every Monday at 00:00 UTC, delete runs older than 14 days, keep the 20 most recent per workflow.

```yaml
name: Clean workflow runs

on:
  schedule:
    - cron: "0 0 * * 1"
  workflow_dispatch:

permissions:
  actions: write

jobs:
  clean:
    runs-on: ubuntu-latest
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v7
        with:
          runs_older_than: 14
          runs_to_keep: 20
```

### Filter by workflow name

Only clean CI / Deploy noise, leave other workflows untouched.

```yaml
- uses: igorjs/gh-actions-clean-workflow@v7
  with:
    workflow_names: "CI, Deploy, Tests"
    runs_older_than: 14
    runs_to_keep: 5
```

### Dry run

Preview what would be deleted without calling the delete API. Useful for the first cron run, or to sanity-check filters.

```yaml
- uses: igorjs/gh-actions-clean-workflow@v7
  with:
    dry_run: true
    runs_older_than: 7
```

### Consume the metrics outputs

```yaml
- name: Clean workflow runs
  id: clean
  uses: igorjs/gh-actions-clean-workflow@v7
  with:
    runs_older_than: 7
    runs_to_keep: 10

- name: Summarize
  run: |
    echo "Found:        ${{ steps.clean.outputs.total-runs-found }}"
    echo "Deleted:      ${{ steps.clean.outputs.runs-deleted }}"
    echo "Failed:       ${{ steps.clean.outputs.runs-failed }}"
    echo "API requests: ${{ steps.clean.outputs.total-api-requests }}"
    echo "Rate limited: ${{ steps.clean.outputs.rate-limit-hits }}"
    echo "CB trips:     ${{ steps.clean.outputs.circuit-breaker-trips }}"
```

<details>
<summary>Manual trigger with inputs</summary>

```yaml
name: Clean workflow runs

on:
  workflow_dispatch:
    inputs:
      runs_older_than:
        description: "Days old to delete"
        default: "7"
      runs_to_keep:
        description: "Most recent runs to keep per workflow"
        default: "0"
      workflow_names:
        description: "Comma-separated workflow names (empty = all)"
        default: ""
      dry_run:
        description: "Dry run mode"
        type: boolean
        default: false

permissions:
  actions: write

jobs:
  clean:
    runs-on: ubuntu-latest
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v7
        with:
          runs_older_than: ${{ github.event.inputs.runs_older_than }}
          runs_to_keep: ${{ github.event.inputs.runs_to_keep }}
          workflow_names: ${{ github.event.inputs.workflow_names }}
          dry_run: ${{ github.event.inputs.dry_run }}
```

</details>

<details>
<summary>Scheduled + manual with shared defaults</summary>

```yaml
name: Clean workflow runs

on:
  schedule:
    - cron: "0 0 * * 1"
  workflow_dispatch:
    inputs:
      runs_older_than:
        description: "Days old to delete"
        default: "7"
      dry_run:
        description: "Dry run mode"
        type: boolean
        default: false

permissions:
  actions: write

env:
  SCHEDULED_RUNS_OLDER_THAN: "7"
  SCHEDULED_RUNS_TO_KEEP: "20"

jobs:
  clean:
    runs-on: ubuntu-latest
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v7
        with:
          runs_older_than: ${{ github.event.inputs.runs_older_than || env.SCHEDULED_RUNS_OLDER_THAN }}
          runs_to_keep: ${{ github.event.inputs.runs_to_keep || env.SCHEDULED_RUNS_TO_KEEP }}
          dry_run: ${{ github.event.inputs.dry_run || false }}
```

</details>

## Advanced behavior

### Retry logic

Failed requests are retried with exponential backoff before giving up.

- Up to 3 retry attempts
- Backoff: 1s, 2s, 4s
- Retries on: 5xx server errors, 429 rate limit, transient network failures
- Does **not** retry on 4xx client errors (except 429)

### Circuit breaker

Prevents the action from hammering an unhealthy API.

- Opens after 5 consecutive failures
- Stays open for 60 seconds, then transitions to half-open
- Half-open allows a probe request; success closes the circuit, failure reopens it
- Trip count exported via `circuit-breaker-trips`

### Rate limiting

- Honors GitHub's `Retry-After` header on 429 responses
- 350 ms delay between deletions to stay under secondary rate limits
- Rate-limit hits exported via `rate-limit-hits`

### Workflow filtering

- Comma-separated names (`workflow_names: "CI, Deploy"`)
- **Case-sensitive** match against the workflow's `name:` field
- Permitted characters: alphanumeric, spaces, dashes, underscores

## Versioning

Pin one of the following based on how aggressively you want updates:

| Tag style | Example | Behavior |
|---|---|---|
| Floating major (recommended) | `@v7` | Auto-updates to the latest `v7.x.y` patch/minor on each run. Breaking changes only on major bumps. |
| Specific tag | `@v7.0.0` | Pinned; never moves. Update manually when you want a new version. |
| Commit SHA | `@<sha>` | Strictest pin. Use when you need byte-for-byte reproducibility (Dependabot can still bump this). |
| `@main` | `@main` | Not recommended for production; pulls whatever is on `main` at run time. |

Releases follow [Semantic Versioning](https://semver.org/). See the [Releases page](https://github.com/igorjs/gh-actions-clean-workflow/releases) for changelogs.

## Development

### Prerequisites

- Node.js >= 26.0.0 (development; the published action runs on GitHub's `node24` runtime)
- pnpm >= 11.5.2 (enforced via `packageManager`; use [Corepack](https://nodejs.org/api/corepack.html))

### Setup

```bash
corepack enable
pnpm install
```

### Common commands

```bash
pnpm run check         # Biome lint + format check
pnpm run check:fix     # Auto-fix lint + format
pnpm run test          # Vitest run
pnpm run test:watch    # Vitest watch
pnpm run test:coverage # Vitest run with v8 coverage + thresholds
pnpm run build         # esbuild bundle to dist/index.js
pnpm run all           # check + test + build
```

### Testing

Tests run on Vitest with v8 coverage. Coverage thresholds are enforced by `vitest.config.ts` (lines/functions/statements >= 90%, branches >= 85%); the CI build fails if coverage drops below them. Live coverage is published as a Shields endpoint badge (see top of this README) from the [`Coverage Badge`](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/coverage-badge.yml) workflow.

## Migrating from v6

v7 keeps the same input names but adds new ones; existing v6 workflows continue to work.

**Breaking**

- Minimum local Node.js version raised to 26.0.0 (only affects contributors; the published action still runs on GitHub's `node24` runtime)
- Internal tooling switched from ESLint + Prettier to [Biome](https://biomejs.dev), and from Jest/`tsup` to [Vitest](https://vitest.dev) + [esbuild](https://esbuild.github.io). End-user surface is unchanged.

**New**

- `workflow_names` input for per-workflow filtering
- `dry_run` input for preview mode
- 9 new metric outputs (`total-api-requests`, `circuit-breaker-trips`, etc.)
- Circuit breaker + retry + rate-limit handling under the hood

**Upgrade**

```diff
- uses: igorjs/gh-actions-clean-workflow@v6
+ uses: igorjs/gh-actions-clean-workflow@v7
  with:
    runs_older_than: 7
+   # Optional new inputs:
+   workflow_names: "CI, Deploy"
+   dry_run: false
```

## Contributing

PRs and issues are welcome. Before submitting:

- Run `pnpm run all` locally (lint + tests + build)
- Sign your commits (DCO is enforced)
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages

See [.github/CONTRIBUTING-RULES.md](.github/CONTRIBUTING-RULES.md) for project-wide contribution rules.

## Security

If you find a vulnerability, please report it privately to the maintainer rather than opening a public issue. Continuous security scanning runs in CI via CodeQL, OSV-Scanner, Socket Security, and betterleaks.

## License

[MIT](LICENSE)
