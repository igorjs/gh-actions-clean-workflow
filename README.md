# Clean Workflow Action

Clean workflow run logs based on configuration.

## Usage

### Parameters
  - token: The token to use to access the GitHub API (required)

  - days_old: The amount of days old to delete (optional, default: 7)

### Outputs

  - result: The number of workflows deleted

### Example

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
          days_old: ${{ github.event.inputs.days_old }}
```
