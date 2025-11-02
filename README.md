# Clean Workflow Action

[![Test and Lint](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/test-and-lint.yml/badge.svg)](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/test-and-lint.yml) [![Check Dist](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/check-dist.yml/badge.svg)](https://github.com/igorjs/gh-actions-clean-workflow/actions/workflows/check-dist.yml)

Clean workflow run logs based on configuration.

## Usage

Please be aware of the Github's API [rate limit](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting).

### Parameters

- token: The token to use to access the GitHub API (optional, default: github.token)

- owner: The owner of the repository (optional, default: github.repository_owner)

- repo: The name of the repository (optional, default: github.repository)

- ~~days_old: The amount of days old to delete (optional, default: 7)~~ (Deprecated)

- runs_older_than: The amount of days for a workflow run, since its last rerun, be considered old (optional, default: 7)

- runs_to_keep: The amount of latest workflows runs to keep (optional, default: 0)

### Outputs

- result: The number of workflows deleted

### Permissions

This workflow needs write permissions on your actions.
Be sure to add the correct permissions as follows:

```yaml
permissions:
  actions: write
```

### Examples

#### Basic usage

```yaml
jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v6
        with:
          token: ${{ github.token }} # optional
          owner: ${{ github.repository_owner }} # optional
          repo: ${{ github.repository }} # optional
          runs_older_than: 7 # optional
          runs_to_keep: 0 # optional
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

jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v6
        with:
          runs_older_than: ${{ github.event.inputs.runs_older_than }} # optional
          runs_to_keep: ${{ github.event.inputs.runs_to_keep }} # optional
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
      - uses: igorjs/gh-actions-clean-workflow@v6
        with:
          runs_older_than: "14" # optional, default value: "7"
          runs_to_keep: "20" # optional, default value: "0"
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

env:
  SCHEDULED_RUNS_OLDER_THAN: "7"
  SCHEDULED_RUNS_TO_KEEP: "20"

jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v6
        with:
          runs_older_than: ${{ github.event.inputs.runs_older_than || env.SCHEDULED_RUNS_OLDER_THAN }}
          runs_to_keep: ${{ github.event.inputs.runs_to_keep || env.SCHEDULED_RUNS_TO_KEEP }}
```
