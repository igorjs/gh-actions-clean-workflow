const core = require('@actions/core');
const github = require('@actions/github');

const main = async () => {
  try {
    /**
     * We need to fetch all the inputs that were provided to our action
     * and store them in variables for us to use.
     **/
    const token = core.getInput('token', { required: true });
    const owner = core.getInput('owner', { required: true });
    const repo = core.getInput('repo', { required: true });

    /**
     * Now we need to create an instance of Octokit which will use to call
     * GitHub's REST API endpoints.
     * We will pass the token as an argument to the constructor. This token
     * will be used to authenticate our requests.
     * You can find all the information about how to use Octokit here:
     * https://octokit.github.io/rest.js/v18
     **/
    const octokit = new github.getOctokit(token);

    /**
     * We need to fetch the list of workflow runs for a particular repo.
     * We use octokit.paginate() to automatically loop over all the pages of the results.
     * Reference: https://octokit.github.io/rest.js/v18#pulls-list-files
     */
    const { data: workflowRuns } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
    });

    /**
     * Loop over all the WorkflowRuns and delete them.
     **/
    const results = await Promise.all(
      workflowRuns.map(({ run_id }) => octokit.rest.actions.deleteWorkflowRun({
        owner,
        repo,
        run_id,
      }))
      .catch(err => `An error occurrend when deleting run: ${err.message}`)
    )

    core.info(results.join('\n'));

  } catch (error) {
    core.setFailed(error.message);
  }
}

// Call the main function to run the action
main();