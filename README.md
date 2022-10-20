# Clean Workflow Action

Clean workflow run logs based on configuration.

## Usage

### Parameters
  - token: The token to use to access the GitHub API (required)

  - owner: The owner of the repository (optional, default: github user)

  - repo: The name of the repository (optional, default: current repository)

  - days_old: The amount of days old to delete (optional, default: 7)

### Outputs

  - result: The number of workflows deleted

### Examples

#### Basic usage

```yaml
jobs:
  clean-logs:
    runs-on: ubuntu-latest
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          owner: igorjs # optional
          repo: my-repo # optional
          days_old: 7 # optional
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

jobs:
  clean-logs:
    runs-on: ubuntu-latest
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          days_old: ${{ github.event.inputs.days_old }} # optional
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
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          days_old: "14" # optional, default value: "7"
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

jobs:
  clean-logs:
    runs-on: ubuntu-latest
    steps:
      - uses: igorjs/gh-actions-clean-workflow@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          days_old: ${{ github.event.inputs.days_old || env.SCHEDULED_DAYS_OLD }}
```
