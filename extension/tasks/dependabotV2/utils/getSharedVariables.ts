import * as tl from 'azure-pipelines-task-lib/task';
import extractHostname from './extractHostname';
import extractOrganization from './extractOrganization';
import extractVirtualDirectory from './extractVirtualDirectory';
import getAzureDevOpsAccessToken from './getAzureDevOpsAccessToken';
import getGithubAccessToken from './getGithubAccessToken';

export interface ISharedVariables {
  /** URL of the organization. This may lack the project name */
  organizationUrl: URL;

  /** Organization URL protocol */
  protocol: string;
  /** Organization URL hostname */
  hostname: string;
  /** Organization URL hostname */
  port: string;
  /** Organization URL virtual directory */
  virtualDirectory: string;
  /** Organization name */
  organization: string;
  /** Project ID */
  projectId: string;
  /** Project name */
  project: string;
  /** Repository name */
  repository: string;
  /** Whether the repository was overridden via input */
  repositoryOverridden: boolean;
  /** Path to the local repository source. When specified, Dependabot will use this local repo rather than cloning it from the remote repo again */
  repositorySourcePath?: string;

  /** Organisation API endpoint URL */
  apiEndpointUrl: string;

  /** The github token */
  githubAccessToken: string;
  /** The access User for Azure DevOps Repos */
  systemAccessUser: string;
  /** The access token for Azure DevOps Repos */
  systemAccessToken: string;

  authorEmail?: string;
  authorName?: string;

  storeDependencyList: boolean;

  /** Determines if the pull requests that dependabot creates should have auto complete set */
  setAutoComplete: boolean;
  /** Merge strategies which can be used to complete a pull request */
  mergeStrategy: string;
  /** List of any policy configuration Id's which auto-complete should not wait for */
  autoCompleteIgnoreConfigIds: number[];

  /** Determines if the pull requests that dependabot creates should be automatically approved */
  autoApprove: boolean;
  /** A personal access token of the user that should approve the PR */
  autoApproveUserToken: string;

  experiments: Record<string, string | boolean>;

  /** Overrides for dependabot images; useful when "latest" does not work and the user wants to use an earlier well-known working version */
  dependabotCliImage: string | undefined;
  dependabotCollectorImage: string | undefined;
  dependabotCollectorConfigPath: string | undefined;
  dependabotProxyImage: string | undefined;
  dependabotUpdaterImage: string | undefined;

  /** Determines if verbose log messages are logged */
  debug: boolean;

  /** List of update identifiers to run */
  targetUpdateIds: number[];

  securityAdvisoriesFile: string | undefined;

  /** Determines whether to skip creating/updating pull requests */
  skipPullRequests: boolean;
  /** Determines whether to comment on pull requests which an explanation of the reason for closing */
  commentPullRequests: boolean;
  /** Determines whether to abandon unwanted pull requests */
  abandonUnwantedPullRequests: boolean;
}

/**
 * Extract shared variables
 *
 * @returns shared variables
 */
export default function getSharedVariables(): ISharedVariables {
  let organizationUrl = tl.getVariable('System.TeamFoundationCollectionUri');

  //convert url string into a valid JS URL object
  let formattedOrganizationUrl = new URL(organizationUrl);
  let protocol: string = formattedOrganizationUrl.protocol.slice(0, -1);
  let hostname: string = extractHostname(formattedOrganizationUrl);
  let port: string = formattedOrganizationUrl.port;
  let virtualDirectory: string = extractVirtualDirectory(formattedOrganizationUrl);
  if (!virtualDirectory) {
    tl.debug(`No virtual directory detected; Running for Azure DevOps Services.`);
  } else {
    tl.debug(`Virtual directory detected; Running for an on-premises Azure DevOps Server.`);
  }
  let organization: string = extractOrganization(organizationUrl);
  let projectId: string = tl.getVariable('System.TeamProjectId');
  let project: string = encodeURI(tl.getVariable('System.TeamProject')); // encode special characters like spaces
  let repository: string = tl.getInput('targetRepositoryName');
  let repositoryOverridden = typeof repository === 'string';
  if (!repositoryOverridden) {
    repository = tl.getVariable('Build.Repository.Name');
    tl.debug(`No custom repository provided; Running update for local repository.`);
  } else {
    tl.debug(`Custom repository provided; Running update for remote repository.`);
  }
  repository = encodeURI(repository); // encode special characters like spaces

  // If the repository name is NOT overridden, then use the already cloned repository source directory
  // for the dependabot update operation. This will save time and bandwidth as we don't have to clone the repository again.
  let repositorySourcePath = repositoryOverridden ? undefined : tl.getVariable('Build.SourcesDirectory');

  const virtualDirectorySuffix = virtualDirectory?.length > 0 ? `${virtualDirectory}/` : '';
  let apiEndpointUrl = `${protocol}://${hostname}:${port}/${virtualDirectorySuffix}`;

  // Prepare the access credentials
  let githubAccessToken: string = getGithubAccessToken();
  let systemAccessUser: string = tl.getInput('azureDevOpsUser');
  let systemAccessToken: string = getAzureDevOpsAccessToken();

  let authorEmail: string | undefined = tl.getInput('authorEmail');
  let authorName: string | undefined = tl.getInput('authorName');

  // Prepare variables for auto complete
  let setAutoComplete = tl.getBoolInput('setAutoComplete', false);
  let mergeStrategy = tl.getInput('mergeStrategy', true);
  let autoCompleteIgnoreConfigIds = tl.getDelimitedInput('autoCompleteIgnoreConfigIds', ';', false).map(Number);

  let storeDependencyList = tl.getBoolInput('storeDependencyList', false);

  // Prepare variables for auto approve
  let autoApprove: boolean = tl.getBoolInput('autoApprove', false);
  let autoApproveUserToken: string = tl.getInput('autoApproveUserToken');

  // Convert experiments from comma separated key value pairs to a record
  let experiments = tl
    .getInput('experiments', false)
    ?.split(',')
    ?.reduce(
      (acc, cur) => {
        let [key, value] = cur.split('=', 2);
        acc[key] = value || true;
        return acc;
      },
      {} as Record<string, string | boolean>,
    );

  let dependabotCliImage: string | undefined = tl.getInput('dependabotCliImage', false);
  let dependabotCollectorImage: string | undefined = tl.getInput('dependabotCollectorImage', false);
  let dependabotCollectorConfigPath: string | undefined = tl.getInput('dependabotCollectorConfigPath', false);
  let dependabotProxyImage: string | undefined = tl.getInput('dependabotProxyImage', false);
  let dependabotUpdaterImage: string | undefined = tl.getInput('dependabotUpdaterImage', false);

  let debug: boolean = tl.getVariable('System.Debug')?.match(/true/i) ? true : false;

  // Get the target identifiers
  let targetUpdateIds = tl.getDelimitedInput('targetUpdateIds', ';', false).map(Number);

  // Prepare other variables
  let securityAdvisoriesFile: string | undefined = tl.getInput('securityAdvisoriesFile');
  let skipPullRequests: boolean = tl.getBoolInput('skipPullRequests', false);
  let commentPullRequests: boolean = tl.getBoolInput('commentPullRequests', false);
  let abandonUnwantedPullRequests: boolean = tl.getBoolInput('abandonUnwantedPullRequests', true);

  return {
    organizationUrl: formattedOrganizationUrl,
    protocol,
    hostname,
    port,
    virtualDirectory,
    organization,
    projectId,
    project,
    repository,
    repositoryOverridden,
    repositorySourcePath,

    apiEndpointUrl,

    githubAccessToken,
    systemAccessUser,
    systemAccessToken,

    authorEmail,
    authorName,

    storeDependencyList,

    setAutoComplete,
    mergeStrategy,
    autoCompleteIgnoreConfigIds,

    autoApprove,
    autoApproveUserToken,

    experiments,

    dependabotCliImage,
    dependabotCollectorImage,
    dependabotCollectorConfigPath,
    dependabotProxyImage,
    dependabotUpdaterImage,

    debug,

    targetUpdateIds,
    securityAdvisoriesFile,

    skipPullRequests,
    commentPullRequests,
    abandonUnwantedPullRequests,
  };
}
