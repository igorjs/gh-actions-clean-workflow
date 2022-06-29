# Clean Workflow Action

Clean workflow run logs based on configuration

## Usage

### Parameters
  - token: The token to use to access the GitHub API (required)

  - owner: The owner of the repository (required)

  - repo: The name of the repository (required)

  - days_old: The amount of days old to delete (default: '7')

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
      - uses: igorjs/gh-actions-clean-workflow@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          owner: ${{ github.repository_owner }}
          repo: ${{ github.event.repository.name }}
          days_old: ${{ github.event.inputs.days_old }}
```

### Known issues

1. The routine only deletes 100 workflows per run. There's an ongoing work to address [this issue](https://github.com/igorjs/gh-actions-clean-workflow/issues/22).

2. The parameter `days_old` isn't working as expected on the [v1](https://github.com/igorjs/gh-actions-clean-workflow/releases/tag/v1). This issue has been addressed on issue [#34](https://github.com/igorjs/gh-actions-clean-workflow/issues/34)
