# Clean Workflow Action

Clean workflow run logs based on configuration.

## Usage

Please be aware of the Github's API [rate limit](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting).

### Parameters

- token: The token to use to access the GitHub API (optional, default: github.token)

- owner: The owner of the repository (optional, default: github.repository_owner)

- repo: The name of the repository (optional, default: github.repository)

- days_old: The amount of days old to delete (optional, default: 7)

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
      - uses: igorjs/gh-actions-clean-workflow@v5
        with:
          token: ${{ github.token }} # optional
          owner: ${{ github.repository_owner }} # optional
          repo: ${{ github.repository }} # optional
          days_old: 7 # optional
          runs_to_keep: 0 # optional
```

#### Manual Trigger

```yaml
name: Clean Workflow Logs

on:
  workflow_dispatch:
    inputs:
      days_old:
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
      - uses: igorjs/gh-actions-clean-workflow@v5
        with:
          days_old: ${{ github.event.inputs.days_old }} # optional
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
      - uses: igorjs/gh-actions-clean-workflow@v5
        with:
          days_old: "14" # optional, default value: "7"
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
      days_old:
        description: "The amount of days old to delete"
        default: "7"
        required: false

env:
  SCHEDULED_DAYS_OLD: "7"
  SCHEDULED_RUNS_TO_KEEP: "20"

jobs:
  clean-logs:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v5
        with:
          days_old: ${{ github.event.inputs.days_old || env.SCHEDULED_DAYS_OLD }}
          runs_to_keep: ${{ github.event.inputs.runs_to_keep || env.SCHEDULED_RUNS_TO_KEEP }}
```
