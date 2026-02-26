/**
 * Social Media Dispatcher
 * 
 * Centralized dispatcher for social media node operations.
 * Routes node operations to appropriate service handlers.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getProviderToken } from '../../shared/social-token-manager';
import { postGitHubIssue, createGitHubRepository, getGitHubUser, commitGitHubFile } from './githubService';
import { postToFacebook, getFacebookUser } from './facebookService';
import { postTweet, getTwitterUser } from './twitterService';
import { withRetry } from './retry-wrapper';
import { SocialServiceResponse } from './types';
import { GitHubNode, GitHubNodeParams, GitHubNodeResult } from './github-node';
import { FacebookNode, FacebookNodeParams, FacebookNodeResult } from './facebook-node';

export interface SocialNodeConfig {
  provider: 'github' | 'facebook' | 'twitter';
  operation: string;
  // Optional resource when using the new node pattern (GitHub/Facebook)
  resource?: GitHubNodeParams['resource'] | FacebookNodeParams['resource'];
  [key: string]: any;
}

/**
 * Execute social media node operation
 */
export async function executeSocialNode(
  supabase: SupabaseClient,
  config: SocialNodeConfig,
  userId?: string,
  currentUserId?: string
): Promise<SocialServiceResponse> {
  const { provider, operation } = config;
  
  // Get token for user
  const userIdsToTry: string[] = [];
  if (userId) userIdsToTry.push(userId);
  if (currentUserId && currentUserId !== userId) userIdsToTry.push(currentUserId);
  
  const token = userIdsToTry.length > 0
    ? await getProviderToken(supabase, userIdsToTry, provider)
    : null;
  
  if (!token) {
    return {
      success: false,
      provider,
      action: operation,
      data: {},
      error: `No ${provider} token found. Please connect your ${provider} account in settings.`,
    };
  }
  
  // Route to appropriate service handler
  try {
    switch (provider) {
      case 'github':
        // Check if using new comprehensive GitHub node pattern (resource/operation)
        if (config.resource && config.operation) {
          // Extract resource and operation, then spread rest of config
          const { resource, operation: op, ...restConfig } = config;
          // Build explicit GitHubNodeParams object to satisfy TypeScript
          const ghParams: GitHubNodeParams = {
            resource: resource as GitHubNodeParams['resource'],
            operation: op as GitHubNodeParams['operation'],
            ...restConfig,
          };
          return await executeGitHubNode(token, ghParams);
        }
        // Otherwise use legacy operation pattern (backward compatible)
        return await executeGitHubOperation(token, operation, config);
      
      case 'facebook':
        // Check if using new comprehensive Facebook node pattern (resource/operation)
        if (config.resource && config.operation) {
          // Extract resource and operation, then spread rest of config
          const { resource, operation: op, ...restConfig } = config;
          // Build explicit FacebookNodeParams object to satisfy TypeScript
          const fbParams: FacebookNodeParams = {
            resource: resource as FacebookNodeParams['resource'],
            operation: op as FacebookNodeParams['operation'],
            ...restConfig,
          };
          return await executeFacebookNode(token, fbParams);
        }
        // Otherwise use legacy operation pattern (backward compatible)
        return await executeFacebookOperation(token, operation, config);
      
      case 'twitter':
        return await executeTwitterOperation(token, operation, config);
      
      default:
        return {
          success: false,
          provider,
          action: operation,
          data: {},
          error: `Unsupported provider: ${provider}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      provider,
      action: operation,
      data: {},
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Execute GitHub node using comprehensive resource/operation pattern
 */
async function executeGitHubNode(
  token: string,
  params: GitHubNodeParams
): Promise<SocialServiceResponse> {
  return withRetry(async () => {
    const node = new GitHubNode(token);
    const result: GitHubNodeResult = await node.execute(params);
    
    // Convert GitHubNodeResult to SocialServiceResponse format
    if (result.success) {
      return {
        success: true,
        provider: 'github',
        action: `${result.resource}.${result.operation}`,
        data: result.data,
        error: null,
      };
    } else {
      return {
        success: false,
        provider: 'github',
        action: `${result.resource}.${result.operation}`,
        data: {},
        error: result.error.message || 'GitHub operation failed',
      };
    }
  });
}

/**
 * Execute GitHub operation
 */
async function executeGitHubOperation(
  token: string,
  operation: string,
  config: Record<string, any>
): Promise<SocialServiceResponse> {
  return withRetry(async () => {
    switch (operation) {
      case 'get_repo':
      case 'get_repository': {
        // Map legacy get_repo operation to new GitHubNode repository.getRepo
        const { owner, repo } = config;
        const ghParams: GitHubNodeParams = {
          resource: 'repository',
          operation: 'getRepo',
          owner,
          repo,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'list_repos':
      case 'list_repositories': {
        // List repositories for authenticated user or organization
        // If owner is provided, list repos for that user/org; otherwise list for authenticated user
        const ghParams: GitHubNodeParams = {
          resource: 'repository',
          operation: 'listRepos',
          owner: config.owner || undefined, // Use owner field (works for both users and orgs)
          type: 'all',
        };
        return await executeGitHubNode(token, ghParams);
      }

      // Issue operations
      case 'list_issues': {
        const ghParams: GitHubNodeParams = {
          resource: 'issue',
          operation: 'listIssues',
          owner: config.owner,
          repo: config.repo,
          state: config.state,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'get_issue': {
        const ghParams: GitHubNodeParams = {
          resource: 'issue',
          operation: 'getIssue',
          owner: config.owner,
          repo: config.repo,
          issue_number: config.issueNumber,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'update_issue': {
        const ghParams: GitHubNodeParams = {
          resource: 'issue',
          operation: 'updateIssue',
          owner: config.owner,
          repo: config.repo,
          issue_number: config.issueNumber,
          title: config.title,
          body: config.body,
          state: config.state,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'close_issue': {
        const ghParams: GitHubNodeParams = {
          resource: 'issue',
          operation: 'updateIssue',
          owner: config.owner,
          repo: config.repo,
          issue_number: config.issueNumber,
          state: 'closed',
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'add_issue_comment': {
        const ghParams: GitHubNodeParams = {
          resource: 'issue',
          operation: 'addIssueComment',
          owner: config.owner,
          repo: config.repo,
          issue_number: config.issueNumber,
          body: config.comment,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'post_issue':
      case 'create_issue': {
        const { owner, repo, title, body, labels } = config;
        return await postGitHubIssue(token, owner, repo, title, body, labels);
      }
      
      case 'create_repo':
      case 'create_repository': {
        const { name, description, private: privateRepo } = config;
        return await createGitHubRepository(token, name, description, privateRepo);
      }
      
      case 'get_user':
      case 'get_profile': {
        return await getGitHubUser(token);
      }

      // Pull Request operations
      case 'list_prs': {
        const ghParams: GitHubNodeParams = {
          resource: 'pullRequest',
          operation: 'listPullRequests',
          owner: config.owner,
          repo: config.repo,
          state: config.state,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'get_pr': {
        const ghParams: GitHubNodeParams = {
          resource: 'pullRequest',
          operation: 'getPullRequest',
          owner: config.owner,
          repo: config.repo,
          pull_number: config.prNumber,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'create_pr': {
        const ghParams: GitHubNodeParams = {
          resource: 'pullRequest',
          operation: 'createPullRequest',
          owner: config.owner,
          repo: config.repo,
          title: config.title,
          head: config.branchName || config.ref,
          base: config.ref || 'main',
          body: config.body,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'update_pr': {
        const ghParams: GitHubNodeParams = {
          resource: 'pullRequest',
          operation: 'updatePullRequest',
          owner: config.owner,
          repo: config.repo,
          pull_number: config.prNumber,
          title: config.title,
          body: config.body,
          state: config.state,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'merge_pr': {
        const ghParams: GitHubNodeParams = {
          resource: 'pullRequest',
          operation: 'mergePullRequest',
          owner: config.owner,
          repo: config.repo,
          pull_number: config.prNumber,
          merge_method: config.mergeMethod,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'add_pr_comment': {
        // PRs are issues under the hood – use issue comment API
        const ghParams: GitHubNodeParams = {
          resource: 'issue',
          operation: 'addIssueComment',
          owner: config.owner,
          repo: config.repo,
          issue_number: config.prNumber,
          body: config.comment,
        };
        return await executeGitHubNode(token, ghParams);
      }

      // Branch operations
      case 'list_branches': {
        const ghParams: GitHubNodeParams = {
          resource: 'branch',
          operation: 'listBranches',
          owner: config.owner,
          repo: config.repo,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'get_branch': {
        const ghParams: GitHubNodeParams = {
          resource: 'branch',
          operation: 'getBranch',
          owner: config.owner,
          repo: config.repo,
          branch: config.branchName || config.ref,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'create_branch': {
        const ghParams: GitHubNodeParams = {
          resource: 'branch',
          operation: 'createBranch',
          owner: config.owner,
          repo: config.repo,
          branch: config.branchName,
          sha: config.sha,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'delete_branch': {
        const ghParams: GitHubNodeParams = {
          resource: 'branch',
          operation: 'deleteBranch',
          owner: config.owner,
          repo: config.repo,
          branch: config.branchName,
        };
        return await executeGitHubNode(token, ghParams);
      }

      // Commit operations
      case 'list_commits': {
        const ghParams: GitHubNodeParams = {
          resource: 'commit',
          operation: 'listCommits',
          owner: config.owner,
          repo: config.repo,
          sha: config.commitSha || config.ref,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'get_commit': {
        const ghParams: GitHubNodeParams = {
          resource: 'commit',
          operation: 'getCommit',
          owner: config.owner,
          repo: config.repo,
          commit_sha: config.commitSha,
        };
        return await executeGitHubNode(token, ghParams);
      }
      
      case 'commit_file':
      case 'commit': {
        const { owner, repo, path, content, message, branch } = config;
        return await commitGitHubFile(token, owner, repo, path, content, message, branch);
      }

      case 'create_commit': {
        // Map create_commit UI operation to commitGitHubFile helper
        const { owner, repo, filePath, fileContent, commitMessage, branchName, ref } = config;
        return await commitGitHubFile(
          token,
          owner,
          repo,
          filePath,
          fileContent,
          commitMessage,
          branchName || ref
        );
      }

      // Release operations
      case 'list_releases': {
        const ghParams: GitHubNodeParams = {
          resource: 'release',
          operation: 'listReleases',
          owner: config.owner,
          repo: config.repo,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'get_release': {
        const ghParams: GitHubNodeParams = {
          resource: 'release',
          operation: 'getRelease',
          owner: config.owner,
          repo: config.repo,
          release_id: config.releaseId,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'create_release': {
        const ghParams: GitHubNodeParams = {
          resource: 'release',
          operation: 'createRelease',
          owner: config.owner,
          repo: config.repo,
          tag_name: config.tagName,
          name: config.releaseName,
          body: config.releaseBody,
        };
        return await executeGitHubNode(token, ghParams);
      }

      // Workflow operations
      case 'get_workflow_runs': {
        const ghParams: GitHubNodeParams = {
          resource: 'workflow',
          operation: 'getWorkflowRuns',
          owner: config.owner,
          repo: config.repo,
          workflowId: config.workflowId,
        };
        return await executeGitHubNode(token, ghParams);
      }

      case 'trigger_workflow': {
        const ghParams: GitHubNodeParams = {
          resource: 'workflow',
          operation: 'triggerWorkflow',
          owner: config.owner,
          repo: config.repo,
          workflowId: config.workflowId,
          ref: config.ref || 'main',
        };
        return await executeGitHubNode(token, ghParams);
      }

      // Repository contributors
      case 'list_contributors': {
        const params: GitHubNodeParams = {
          resource: 'repository',
          operation: 'listContributors',
          owner: config.owner,
          repo: config.repo,
        };
        // listContributors handled via repository handler extension (using Octokit directly)
        const node = new GitHubNode(token);
        const result = await node.execute(params);
        if (result.success) {
          return {
            success: true,
            provider: 'github',
            action: 'repository.listContributors',
            data: result.data as any,
            error: null,
          };
        } else {
          return {
            success: false,
            provider: 'github',
            action: 'repository.listContributors',
            data: {},
            error: result.error.message,
          };
        }
      }
      
      default:
        return {
          success: false,
          provider: 'github',
          action: operation,
          data: {},
          error: `Unsupported GitHub operation: ${operation}`,
        };
    }
  });
}

/**
 * Execute Facebook node using comprehensive resource/operation pattern
 */
async function executeFacebookNode(
  token: string,
  params: FacebookNodeParams
): Promise<SocialServiceResponse> {
  return withRetry(async () => {
    const node = new FacebookNode(token);
    const result: FacebookNodeResult = await node.execute(params);
    
    // Convert FacebookNodeResult to SocialServiceResponse format
    if (result.success) {
      return {
        success: true,
        provider: 'facebook',
        action: `${result.resource}.${result.operation}`,
        data: result.data,
        error: null,
      };
    } else {
      return {
        success: false,
        provider: 'facebook',
        action: `${result.resource}.${result.operation}`,
        data: {},
        error: result.error?.message || 'Facebook operation failed',
      };
    }
  });
}

/**
 * Execute Facebook operation (legacy pattern for backward compatibility)
 */
async function executeFacebookOperation(
  token: string,
  operation: string,
  config: Record<string, any>
): Promise<SocialServiceResponse> {
  return withRetry(async () => {
    switch (operation) {
      case 'post':
      case 'create_post': {
        const { message, pageId, link } = config;
        return await postToFacebook(token, message, pageId, link);
      }
      
      case 'get_user':
      case 'get_profile': {
        return await getFacebookUser(token);
      }
      
      default:
        return {
          success: false,
          provider: 'facebook',
          action: operation,
          data: {},
          error: `Unsupported Facebook operation: ${operation}`,
        };
    }
  });
}

/**
 * Execute Twitter operation
 */
async function executeTwitterOperation(
  token: string,
  operation: string,
  config: Record<string, any>
): Promise<SocialServiceResponse> {
  return withRetry(async () => {
    switch (operation) {
      case 'post':
      case 'tweet':
      case 'create_tweet': {
        const { text } = config;
        return await postTweet(token, text);
      }
      
      case 'get_user':
      case 'get_profile': {
        return await getTwitterUser(token);
      }
      
      default:
        return {
          success: false,
          provider: 'twitter',
          action: operation,
          data: {},
          error: `Unsupported Twitter operation: ${operation}`,
        };
    }
  });
}
