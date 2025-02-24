import { error, warning } from 'azure-pipelines-task-lib/task';
import { AzureDevOpsWebApiClient } from '../azure-devops/AzureDevOpsWebApiClient';
import { IPullRequestProperties } from '../azure-devops/interfaces/IPullRequest';
import { IDependabotUpdate } from '../dependabot/interfaces/IDependabotConfig';
import { ISharedVariables } from '../getSharedVariables';
import { DependabotOutputProcessor } from './DependabotOutputProcessor';
import { IDependabotUpdateOperation } from './interfaces/IDependabotUpdateOperation';

jest.mock('../azure-devops/AzureDevOpsWebApiClient');
jest.mock('../getSharedVariables');
jest.mock('azure-pipelines-task-lib/task');

describe('DependabotOutputProcessor', () => {
  let processor: DependabotOutputProcessor;
  let taskInputs: ISharedVariables;
  let prAuthorClient: AzureDevOpsWebApiClient;
  let prApproverClient: AzureDevOpsWebApiClient;
  let existingBranchNames: string[];
  let existingPullRequests: IPullRequestProperties[];

  beforeEach(() => {
    taskInputs = {} as ISharedVariables;
    prAuthorClient = new AzureDevOpsWebApiClient(undefined, undefined, true);
    prApproverClient = new AzureDevOpsWebApiClient(undefined, undefined, true);
    existingBranchNames = [];
    existingPullRequests = [];
    processor = new DependabotOutputProcessor(
      taskInputs,
      prAuthorClient,
      prApproverClient,
      existingBranchNames,
      existingPullRequests,
      true,
    );
  });

  describe('process', () => {
    let update: IDependabotUpdateOperation;
    let data: any;

    beforeEach(() => {
      update = {
        job: {} as any,
        credentials: {} as any,
        config: {} as IDependabotUpdate,
      } as IDependabotUpdateOperation;
      data = {};
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should skip processing "update_dependency_list" if "storeDependencyList" is false', async () => {
      taskInputs.storeDependencyList = false;
      prAuthorClient.updateProjectProperty = jest.fn().mockResolvedValue(false);

      const result = await processor.process(update, 'update_dependency_list', data);

      expect(result).toBe(true);
      expect(prApproverClient.updateProjectProperty).toHaveBeenCalledTimes(0);
    });

    it('should process "update_dependency_list"', async () => {
      taskInputs.storeDependencyList = true;
      prAuthorClient.updateProjectProperty = jest.fn().mockResolvedValue(true);

      const result = await processor.process(update, 'update_dependency_list', data);

      expect(result).toBe(true);
      expect(prAuthorClient.updateProjectProperty).toHaveBeenCalledTimes(1);
    });

    it('should skip processing "create_pull_request" if "skipPullRequests" is true', async () => {
      taskInputs.skipPullRequests = true;

      const result = await processor.process(update, 'create_pull_request', data);

      expect(result).toBe(true);
      expect(prAuthorClient.createPullRequest).toHaveBeenCalledTimes(0);
    });

    it('should skip processing "create_pull_request" if open pull request limit is reached', async () => {
      update.config['open-pull-requests-limit'] = 1;
      existingPullRequests.push({ id: 1 } as IPullRequestProperties);
      const result = await processor.process(update, 'create_pull_request', data);

      expect(result).toBe(true);
      expect(prAuthorClient.createPullRequest).toHaveBeenCalledTimes(0);
    });

    it('should process "create_pull_request"', async () => {
      taskInputs.autoApprove = true;
      data = {
        'pr-title': 'Test PR',
        'base-commit-sha': '123456',
        'pr-body': 'Test body',
        'commit-message': 'Test commit message',
        'dependencies': [],
        'updated-dependency-files': [],
      };

      prAuthorClient.createPullRequest = jest.fn().mockResolvedValue(1);
      prAuthorClient.getDefaultBranch = jest.fn().mockResolvedValue('main');
      prApproverClient.approvePullRequest = jest.fn().mockResolvedValue(true);

      const result = await processor.process(update, 'create_pull_request', data);

      expect(result).toBe(true);
      expect(prAuthorClient.createPullRequest).toHaveBeenCalledTimes(1);
      expect(prApproverClient.approvePullRequest).toHaveBeenCalledTimes(1);
    });

    it('should skip processing "update_pull_request" if "skipPullRequests" is false', async () => {
      taskInputs.skipPullRequests = true;

      const result = await processor.process(update, 'update_pull_request', data);

      expect(result).toBe(true);
      expect(prAuthorClient.updatePullRequest).toHaveBeenCalledTimes(0);
    });

    it('should fail processing "update_pull_request" if pull request does not exist', async () => {
      data = {
        'dependency-names': ['dependency1'],
      };

      const result = await processor.process(update, 'update_pull_request', data);

      expect(result).toBe(false);
      expect(prAuthorClient.updatePullRequest).toHaveBeenCalledTimes(0);
    });

    it('should process "update_pull_request"', async () => {
      taskInputs.autoApprove = true;
      update.job['package-manager'] = 'npm';
      data = {
        'base-commit-sha': '123456',
        'dependency-names': ['dependency1'],
        'dependencies': [],
        'updated-dependency-files': [],
      };

      existingPullRequests.push({
        id: 1,
        properties: [
          { name: DependabotOutputProcessor.PR_PROPERTY_NAME_PACKAGE_MANAGER, value: 'npm' },
          {
            name: DependabotOutputProcessor.PR_PROPERTY_NAME_DEPENDENCIES,
            value: JSON.stringify([{ 'dependency-name': 'dependency1' }]),
          },
        ],
      });

      prAuthorClient.updatePullRequest = jest.fn().mockResolvedValue(true);
      prApproverClient.approvePullRequest = jest.fn().mockResolvedValue(true);

      const result = await processor.process(update, 'update_pull_request', data);

      expect(result).toBe(true);
      expect(prAuthorClient.updatePullRequest).toHaveBeenCalledTimes(1);
      expect(prApproverClient.approvePullRequest).toHaveBeenCalledTimes(1);
    });

    it('should skip processing "close_pull_request" if "abandonUnwantedPullRequests" is false', async () => {
      taskInputs.abandonUnwantedPullRequests = false;

      const result = await processor.process(update, 'close_pull_request', data);

      expect(result).toBe(true);
      expect(prAuthorClient.abandonPullRequest).toHaveBeenCalledTimes(0);
    });

    it('should fail processing "close_pull_request" if pull request does not exist', async () => {
      taskInputs.abandonUnwantedPullRequests = true;
      data = {
        'dependency-names': ['dependency1'],
      };

      const result = await processor.process(update, 'close_pull_request', data);

      expect(result).toBe(false);
      expect(prAuthorClient.abandonPullRequest).toHaveBeenCalledTimes(0);
    });

    it('should process "close_pull_request"', async () => {
      taskInputs.abandonUnwantedPullRequests = true;
      update.job['package-manager'] = 'npm';
      data = {
        'dependency-names': ['dependency1'],
      };
      existingPullRequests.push({
        id: 1,
        properties: [
          { name: DependabotOutputProcessor.PR_PROPERTY_NAME_PACKAGE_MANAGER, value: 'npm' },
          {
            name: DependabotOutputProcessor.PR_PROPERTY_NAME_DEPENDENCIES,
            value: JSON.stringify([{ 'dependency-name': 'dependency1' }]),
          },
        ],
      });

      prAuthorClient.abandonPullRequest = jest.fn().mockResolvedValue(true);

      const result = await processor.process(update, 'close_pull_request', data);

      expect(result).toBe(true);
      expect(prAuthorClient.abandonPullRequest).toHaveBeenCalledTimes(1);
    });

    it('should process "mark_as_processed"', async () => {
      const result = await processor.process(update, 'mark_as_processed', data);

      expect(result).toBe(true);
    });

    it('should process "record_ecosystem_versions"', async () => {
      const result = await processor.process(update, 'record_ecosystem_versions', data);

      expect(result).toBe(true);
    });

    it('should process "record_update_job_error"', async () => {
      const result = await processor.process(update, 'record_update_job_error', data);

      expect(result).toBe(false);
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('should process "record_update_job_unknown_error"', async () => {
      const result = await processor.process(update, 'record_update_job_unknown_error', data);

      expect(result).toBe(false);
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('should process "increment_metric"', async () => {
      const result = await processor.process(update, 'increment_metric', data);

      expect(result).toBe(true);
    });

    it('should handle unknown output type', async () => {
      const result = await processor.process(update, 'non_existant_output_type', data);

      expect(result).toBe(true);
      expect(warning).toHaveBeenCalledTimes(1);
    });
  });
});
