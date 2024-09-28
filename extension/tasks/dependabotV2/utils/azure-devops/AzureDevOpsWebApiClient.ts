import { RestClient } from 'typed-rest-client/RestClient';
import { WebApi, getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import {
  CommentThreadStatus,
  CommentType,
  IdentityRefWithVote,
  ItemContentType,
  PullRequestAsyncStatus,
  PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { error, warning } from 'azure-pipelines-task-lib/task';
import { IFileChange } from './interfaces/IFileChange';
import { IPullRequest } from './interfaces/IPullRequest';
import { IPullRequestProperties } from './interfaces/IPullRequestProperties';
import { resolveAzureDevOpsIdentities } from './resolveAzureDevOpsIdentities';

/**
 * Wrapper for DevOps WebApi client with helper methods for easier management of dependabot pull requests
 */
export class AzureDevOpsWebApiClient {
  private readonly organisationApiUrl: string;
  private readonly accessToken: string;
  private readonly connection: WebApi;
  private cachedSecurityNamespaces: any;
  private cachedUserIds: Record<string, string>;

  constructor(organisationApiUrl: string, accessToken: string) {
    this.organisationApiUrl = organisationApiUrl;
    this.accessToken = accessToken;
    this.connection = new WebApi(organisationApiUrl, getPersonalAccessTokenHandler(accessToken));
    this.cachedSecurityNamespaces = undefined;
    this.cachedUserIds = {};
  }

  /**
   * Get the identity of a user by email address. If no email is provided, the identity of the authenticated user is returned.
   * @param email
   * @returns
   */
  public async getUserId(email?: string): Promise<string> {
    // If no email is provided, resolve to the authenticated user
    if (!email) {
      this.cachedUserIds[this.accessToken] ||= (await this.connection.connect())?.authenticatedUser?.id || '';
      return this.cachedUserIds[this.accessToken];
    }

    // Otherwise, do a cached identity lookup of the supplied email address
    // TODO: When azure-devops-node-api supports Graph API, use that instead of the REST API
    else if (!this.cachedUserIds[email]) {
      const identities = await resolveAzureDevOpsIdentities(new URL(this.organisationApiUrl), [email]);
      identities.forEach((i) => (this.cachedUserIds[i.input] ||= i.id));
    }

    return this.cachedUserIds[email];
  }

  /**
   * Get the default branch for a repository
   * @param project
   * @param repository
   * @returns
   */
  public async getDefaultBranch(project: string, repository: string): Promise<string | undefined> {
    try {
      const git = await this.connection.getGitApi();
      const repo = await git.getRepository(repository, project);
      if (!repo) {
        throw new Error(`Repository '${project}/${repository}' not found`);
      }

      return repo.defaultBranch;
    } catch (e) {
      error(`Failed to get default branch for '${project}/${repository}': ${e}`);
      console.debug(e); // Dump the error stack trace to help with debugging
      return undefined;
    }
  }

  /**
   * Get the contents of a file in a repository
   * @param project
   * @param repository
   * @param creator
   * @returns
   */
  public async getRepositoryFileContents(
    project: string,
    repository: string,
    filePath: string,
  ): Promise<string | undefined> {
    try {

      // Find the item in the repository
      const git = await this.connection.getGitApi();
      const items = await git.getItems(repository, project, filePath);
      if (items.length > 1) {
        throw new Error(`Multiple items found for path '${filePath}' in repository '${project}/${repository}'`);
      }
      if (items.length === 0) {
        return undefined;
      }

      // Get the file contents
      const response = await this.connection.rest.client.get(items[0].url);
      return await response.readBody();

    } catch (e) {
      error(`Failed to get file contents from repository: ${e}`);
      console.debug(e); // Dump the error stack trace to help with debugging
      return undefined;
    }
  }

  /**
   * Get the properties for all active pull request created by the supplied user
   * @param project
   * @param repository
   * @param creator
   * @returns
   */
  public async getActivePullRequestProperties(
    project: string,
    repository: string,
    creator: string,
  ): Promise<IPullRequestProperties[]> {
    console.info(`Fetching active pull request properties in '${project}/${repository}' for user id '${creator}'...`);
    try {
      const git = await this.connection.getGitApi();
      const pullRequests = await git.getPullRequests(
        repository,
        {
          creatorId: isGuid(creator) ? creator : await this.getUserId(creator),
          status: PullRequestStatus.Active,
        },
        project,
      );

      return await Promise.all(
        pullRequests?.map(async (pr) => {
          const properties = (await git.getPullRequestProperties(repository, pr.pullRequestId, project))?.value;
          return {
            id: pr.pullRequestId,
            properties:
              Object.keys(properties)?.map((key) => {
                return {
                  name: key,
                  value: properties[key].$value,
                };
              }) || [],
          };
        }),
      );
    } catch (e) {
      error(`Failed to list active pull request properties: ${e}`);
      console.debug(e); // Dump the error stack trace to help with debugging
      return [];
    }
  }

  /**
   * Create a new pull request
   * @param pr
   * @returns
   */
  public async createPullRequest(pr: IPullRequest): Promise<number | null> {
    console.info(`Creating pull request '${pr.title}'...`);
    try {
      const userId = await this.getUserId();
      const git = await this.connection.getGitApi();

      // Create the source branch and commit the file changes
      console.info(` - Pushing ${pr.changes.length} change(s) to branch '${pr.source.branch}'...`);
      const push = await git.createPush(
        {
          refUpdates: [
            {
              name: `refs/heads/${pr.source.branch}`,
              oldObjectId: pr.source.commit,
            },
          ],
          commits: [
            {
              comment: pr.commitMessage,
              author: pr.author,
              changes: pr.changes.map((change) => {
                return {
                  changeType: change.changeType,
                  item: {
                    path: normalizeDevOpsPath(change.path),
                  },
                  newContent: {
                    content: Buffer.from(change.content, <BufferEncoding>change.encoding).toString('base64'),
                    contentType: ItemContentType.Base64Encoded,
                  },
                };
              }),
            },
          ],
        },
        pr.repository,
        pr.project,
      );

      // Build the list of the pull request reviewers
      // NOTE: Azure DevOps does not have a concept of assignees, only reviewers.
      //       We treat assignees as required reviewers and all other reviewers as optional.
      const allReviewers: IdentityRefWithVote[] = [];
      if (pr.assignees?.length > 0) {
        for (const assignee of pr.assignees) {
          const identityId = isGuid(assignee) ? assignee : await this.getUserId(assignee);
          if (identityId) {
            allReviewers.push({
              id: identityId,
              isRequired: true,
              isFlagged: true,
            });
          } else {
            warning(` - Unable to resolve assignee identity '${assignee}'`);
          }
        }
      }
      if (pr.reviewers?.length > 0) {
        for (const reviewer of pr.reviewers) {
          const identityId = isGuid(reviewer) ? reviewer : await this.getUserId(reviewer);
          if (identityId) {
            allReviewers.push({
              id: identityId,
            });
          } else {
            warning(` - Unable to resolve reviewer identity '${reviewer}'`);
          }
        }
      }

      // Create the pull request
      console.info(` - Creating pull request to merge '${pr.source.branch}' into '${pr.target.branch}'...`);
      const pullRequest = await git.createPullRequest(
        {
          sourceRefName: `refs/heads/${pr.source.branch}`,
          targetRefName: `refs/heads/${pr.target.branch}`,
          title: pr.title,
          description: pr.description,
          reviewers: allReviewers,
          workItemRefs: pr.workItems?.map((id) => {
            return { id: id };
          }),
          labels: pr.labels?.map((label) => {
            return { name: label };
          }),
          isDraft: false, // TODO: Add config for this?
        },
        pr.repository,
        pr.project,
        true,
      );

      // Add the pull request properties
      if (pr.properties?.length > 0) {
        console.info(` - Adding dependency metadata to pull request properties...`);
        await git.updatePullRequestProperties(
          null,
          pr.properties.map((property) => {
            return {
              op: 'add',
              path: '/' + property.name,
              value: property.value,
            };
          }),
          pr.repository,
          pullRequest.pullRequestId,
          pr.project,
        );
      }

      // TODO: Upload the pull request description as a 'changes.md' file attachment?
      //       This might be a way to work around the 4000 character limit for PR descriptions, but needs more investigation.
      // https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-attachments/create?view=azure-devops-rest-7.1

      // Set the pull request auto-complete status
      if (pr.autoComplete) {
        console.info(` - Setting auto-complete...`);
        await git.updatePullRequest(
          {
            autoCompleteSetBy: {
              id: userId,
            },
            completionOptions: {
              autoCompleteIgnoreConfigIds: pr.autoComplete.ignorePolicyConfigIds,
              deleteSourceBranch: true,
              mergeCommitMessage: mergeCommitMessage(pullRequest.pullRequestId, pr.title, pr.description),
              mergeStrategy: pr.autoComplete.mergeStrategy,
              transitionWorkItems: false,
            },
          },
          pr.repository,
          pullRequest.pullRequestId,
          pr.project,
        );
      }

      console.info(` - Pull request #${pullRequest.pullRequestId} was created successfully.`);
      return pullRequest.pullRequestId;
    } catch (e) {
      error(`Failed to create pull request: ${e}`);
      console.debug(e); // Dump the error stack trace to help with debugging
      return null;
    }
  }

  /**
   * Update a pull request
   * @param options
   * @returns
   */
  public async updatePullRequest(options: {
    project: string;
    repository: string;
    pullRequestId: number;
    changes: IFileChange[];
    skipIfCommitsFromUsersOtherThan?: string;
    skipIfNoConflicts?: boolean;
  }): Promise<boolean> {
    console.info(`Updating pull request #${options.pullRequestId}...`);
    try {
      const userId = await this.getUserId();
      const git = await this.connection.getGitApi();

      // Get the pull request details
      const pullRequest = await git.getPullRequest(options.repository, options.pullRequestId, options.project);
      if (!pullRequest) {
        throw new Error(`Pull request #${options.pullRequestId} not found`);
      }

      // Skip if no merge conflicts
      if (options.skipIfNoConflicts && pullRequest.mergeStatus !== PullRequestAsyncStatus.Conflicts) {
        console.info(` - Skipping update as pull request has no merge conflicts.`);
        return true;
      }

      // Skip if the pull request has been modified by another user
      const commits = await git.getPullRequestCommits(options.repository, options.pullRequestId, options.project);
      if (
        options.skipIfCommitsFromUsersOtherThan &&
        commits.some((c) => c.author?.email !== options.skipIfCommitsFromUsersOtherThan)
      ) {
        console.info(` - Skipping update as pull request has been modified by another user.`);
        return true;
      }

      // Push changes to the source branch
      console.info(` - Pushing ${options.changes.length} change(s) branch '${pullRequest.sourceRefName}'...`);
      const push = await git.createPush(
        {
          refUpdates: [
            {
              name: pullRequest.sourceRefName,
              oldObjectId: pullRequest.lastMergeSourceCommit.commitId,
            },
          ],
          commits: [
            {
              comment:
                pullRequest.mergeStatus === PullRequestAsyncStatus.Conflicts
                  ? 'Resolve merge conflicts'
                  : 'Update dependency files',
              changes: options.changes.map((change) => {
                return {
                  changeType: change.changeType,
                  item: {
                    path: normalizeDevOpsPath(change.path),
                  },
                  newContent: {
                    content: Buffer.from(change.content, <BufferEncoding>change.encoding).toString('base64'),
                    contentType: ItemContentType.Base64Encoded,
                  },
                };
              }),
            },
          ],
        },
        options.repository,
        options.project,
      );

      console.info(` - Pull request #${options.pullRequestId} was updated successfully.`);
      return true;
    } catch (e) {
      error(`Failed to update pull request: ${e}`);
      console.debug(e); // Dump the error stack trace to help with debugging
      return false;
    }
  }

  /**
   * Approve a pull request
   * @param options
   * @returns
   */
  public async approvePullRequest(options: {
    project: string;
    repository: string;
    pullRequestId: number;
  }): Promise<boolean> {
    console.info(`Approving pull request #${options.pullRequestId}...`);
    try {
      const userId = await this.getUserId();
      const git = await this.connection.getGitApi();

      // Approve the pull request
      console.info(` - Creating reviewer vote on pull request...`);
      await git.createPullRequestReviewer(
        {
          vote: 10, // 10 - approved 5 - approved with suggestions 0 - no vote -5 - waiting for author -10 - rejected
          isReapprove: true,
        },
        options.repository,
        options.pullRequestId,
        userId,
        options.project,
      );

      console.info(` - Pull request #${options.pullRequestId} was approved.`);
    } catch (e) {
      error(`Failed to approve pull request: ${e}`);
      console.debug(e); // Dump the error stack trace to help with debugging
      return false;
    }
  }

  /**
   * Close a pull request
   * @param options
   * @returns
   */
  public async closePullRequest(options: {
    project: string;
    repository: string;
    pullRequestId: number;
    comment: string;
    deleteSourceBranch: boolean;
  }): Promise<boolean> {
    console.info(`Closing pull request #${options.pullRequestId}...`);
    try {
      const userId = await this.getUserId();
      const git = await this.connection.getGitApi();

      // Add a comment to the pull request, if supplied
      if (options.comment) {
        console.info(` - Adding comment to pull request...`);
        await git.createThread(
          {
            status: CommentThreadStatus.Closed,
            comments: [
              {
                author: {
                  id: userId,
                },
                content: options.comment,
                commentType: CommentType.System,
              },
            ],
          },
          options.repository,
          options.pullRequestId,
          options.project,
        );
      }

      // Close the pull request
      console.info(` - Abandoning pull request...`);
      const pullRequest = await git.updatePullRequest(
        {
          status: PullRequestStatus.Abandoned,
          closedBy: {
            id: userId,
          },
        },
        options.repository,
        options.pullRequestId,
        options.project,
      );

      // Delete the source branch if required
      if (options.deleteSourceBranch) {
        console.info(` - Deleting source branch...`);
        await git.updateRef(
          {
            name: `refs/heads/${pullRequest.sourceRefName}`,
            oldObjectId: pullRequest.lastMergeSourceCommit.commitId,
            newObjectId: '0000000000000000000000000000000000000000',
            isLocked: false,
          },
          options.repository,
          '',
          options.project,
        );
      }

      console.info(` - Pull request #${options.pullRequestId} was closed successfully.`);
      return true;
    } catch (e) {
      error(`Failed to close pull request: ${e}`);
      console.debug(e); // Dump the error stack trace to help with debugging
      return false;
    }
  }

  /**
   * Get project properties
   * @param project
   * @param valueBuilder
   * @returns
   */
  public async getProjectProperties(project: string): Promise<Record<string, string> | undefined> {
    try {
      const core = await this.connection.getCoreApi();
      const projects = await core.getProjects();
      const projectGuid = projects?.find((p) => p.name === project)?.id;
      const properties = await core.getProjectProperties(projectGuid);
      return properties.map((p) => ({ [p.name]: p.value })).reduce((a, b) => ({ ...a, ...b }), {});
    } catch (e) {
      error(`Failed to get project properties: ${e}`);
      console.debug(e); // Dump the error stack trace to help with debugging
      return undefined;
    }
  }

  /**
   * Update a project property
   * @param project
   * @param name
   * @param valueBuilder
   * @returns
   */
  public async updateProjectProperty(
    project: string,
    name: string,
    valueBuilder: (existingValue: string) => string,
  ): Promise<void> {
    try {
      // Get the existing project property value
      const core = await this.connection.getCoreApi();
      const projects = await core.getProjects();
      const projectGuid = projects?.find((p) => p.name === project)?.id;
      const properties = await core.getProjectProperties(projectGuid);
      const propertyValue = properties?.find((p) => p.name === name)?.value;

      // Update the project property
      await core.setProjectProperties(undefined, projectGuid, [
        {
          op: 'add',
          path: '/' + name,
          value: valueBuilder(propertyValue || ''),
        },
      ]);
    } catch (e) {
      error(`Failed to update project property '${name}': ${e}`);
      console.debug(e); // Dump the error stack trace to help with debugging
    }
  }

  /**
   * Check if the authenticated user has the requested permissions, throws error if any are missing
   * @param securityNamespacePermissions
   */
  public async assertUserPermissions(securityNamespacePermissions: Record<string, { token: string, actions: string[] }>): Promise<void> {

    // Get and cache the security namespaces for the organisation
    this.cachedSecurityNamespaces ||= (await this.restApiRequest(
      `${this.organisationApiUrl}/_apis/securitynamespaces?api-version=7.1`
    ))?.value;

    // Convert the requested permissions into a list of permission evaluations
    const permissionEvaluations = [];
    for (const namespace of this.cachedSecurityNamespaces) {
      const requestedNamespacePermission = securityNamespacePermissions[namespace.name];
      if (!requestedNamespacePermission) {
        continue;
      }
      const requestedActions = namespace.actions.filter((a) => requestedNamespacePermission.actions.includes(a.name));
      permissionEvaluations.push(
        {
          securityNamespaceId: namespace.namespaceId,
          token: requestedNamespacePermission.token,
          permissions: requestedActions.reduce((p, a) => p | a.bit, 0),
        }
      );
    }

    // Evaluate the permissions
    const evaluatedPermissions = await this.restApiRequest(
      `${this.organisationApiUrl}/_apis/security/permissionevaluationbatch?api-version=7.1`,
      {
        alwaysAllowAdministrators: false,
        evaluations: permissionEvaluations,
      }
    );

    // If any permissions are missing, log and throw an error
    const missingPermissions = evaluatedPermissions.evaluations?.filter((e) => !e.value);
    if (missingPermissions.length > 0) {
      const userId = await this.getUserId();
      for (const missingPermission of missingPermissions) {
        const namespace = this.cachedSecurityNamespaces?.find((n) => n.namespaceId === missingPermission.securityNamespaceId)?.name;
        error(`User '${userId}' requires permission to ${namespace?.toLowerCase()} "${missingPermission.role}" with action(s) ${JSON.stringify(securityNamespacePermissions[namespace])}.`);
      }
      throw new Error(`User '${userId}' does not have required permissions to complete this task. Review the errors above for more information.`);
    }
  }

  /**
   * Make a REST API request to the DevOps API.
   * This is used for operations that are not yet supported by the node/typed API.
   * @param url
   * @param data
   * @returns
   */
  private async restApiRequest(url: string, data?: any): Promise<any | undefined> {
    try {
      var response = data 
        ? await this.connection.rest.client.post(url, JSON.stringify(data), { 'Content-Type': 'application/json' })
        : await this.connection.rest.client.get(url, { 'Accept': 'application/json' });
      if (response.message.statusCode === 200) {
        return JSON.parse(await response.readBody());
      }
    } catch (error) {
      var responseStatusCode = error?.response?.statusCode;
      if (responseStatusCode === 404) {
        return undefined;
      } else if (responseStatusCode === 401) {
        throw new Error(`No access token has been provided to access '${url}'`);
      } else if (responseStatusCode === 403) {
        throw new Error(`The access token provided does not have permissions to access '${url}'`);
      } else {
        throw error;
      }
    }
  }
}

function normalizeDevOpsPath(path: string): string {
  // Convert backslashes to forward slashes, convert './' => '/' and ensure the path starts with a forward slash if it doesn't already, this is how DevOps paths are formatted
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '/')
    .replace(/^([^/])/, '/$1');
}

function mergeCommitMessage(id: number, title: string, description: string): string {
  //
  // The merge commit message should contain the PR number and title for tracking.
  // This is the default behaviour in Azure DevOps.
  // Example:
  //   Merged PR 24093: Bump Tingle.Extensions.Logging.LogAnalytics from 3.4.2-ci0005 to 3.4.2-ci0006
  //
  //   Bumps [Tingle.Extensions.Logging.LogAnalytics](...) from 3.4.2-ci0005 to 3.4.2-ci0006
  //   - [Release notes](....)
  //   - [Changelog](....)
  //   - [Commits](....)
  //
  // There appears to be a DevOps bug when setting "completeOptions" with a "mergeCommitMessage" even when truncated to 4000 characters.
  // The error message is:
  //   Invalid argument value.
  //   Parameter name: Completion options have exceeded the maximum encoded length (4184/4000)
  //
  // The effective limit seems to be about 3500 characters:
  //   https://developercommunity.visualstudio.com/t/raise-the-character-limit-for-pull-request-descrip/365708#T-N424531
  //
  return `Merged PR ${id}: ${title}\n\n${description}`.slice(0, 3500);
}

function isGuid(guid: string): boolean {
  const regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return regex.test(guid);
}
