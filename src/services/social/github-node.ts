/**
 * GitHub Node - Comprehensive GitHub API Integration
 * 
 * Production-ready GitHub workflow node supporting multiple resources and operations.
 * Uses @octokit/rest for robust API interaction with automatic pagination and error handling.
 */

import { Octokit } from '@octokit/rest';
import type { RequestError } from '@octokit/request-error';

const USER_AGENT = 'CtrlChecks-GitHubNode/1.0';

export type GitHubResource =
  | 'repository'
  | 'issue'
  | 'pullRequest'
  | 'file'
  | 'commit'
  | 'branch'
  | 'release'
  | 'workflow';

export type GitHubOperation =
  // repository
  | 'getRepo'
  | 'listRepos'
  | 'createRepo'
  | 'updateRepo'
  | 'deleteRepo'
  // issue
  | 'getIssue'
  | 'listIssues'
  | 'createIssue'
  | 'updateIssue'
  | 'addIssueComment'
  | 'lockIssue'
  | 'unlockIssue'
  // pull request
  | 'getPullRequest'
  | 'listPullRequests'
  | 'createPullRequest'
  | 'updatePullRequest'
  | 'mergePullRequest'
  | 'requestReviewers'
  // file / content
  | 'getContents'
  | 'createOrUpdateFile'
  | 'deleteFile'
  // commit
  | 'listCommits'
  | 'getCommit'
  // branch
  | 'listBranches'
  | 'getBranch'
  | 'createBranch'
  | 'deleteBranch'
  // release
  | 'getRelease'
  | 'listReleases'
  | 'createRelease'
  | 'updateRelease'
  | 'deleteRelease'
  // workflow / actions
  | 'getWorkflowRuns'
  | 'triggerWorkflow'
  // repository helpers
  | 'listContributors';

export interface GitHubNodeParams {
  resource: GitHubResource;
  operation: GitHubOperation;
  // Common parameters
  owner?: string;
  repo?: string;
  // Generic dynamic parameters
  [key: string]: any;
}

export interface GitHubNodeSuccess<T = any> {
  success: true;
  provider: 'github';
  resource: GitHubResource;
  operation: GitHubOperation;
  data: T;
}

export interface GitHubNodeError {
  success: false;
  provider: 'github';
  resource: GitHubResource;
  operation: GitHubOperation;
  error: {
    message: string;
    statusCode?: number;
    documentationUrl?: string;
    details?: any;
  };
}

export type GitHubNodeResult<T = any> = GitHubNodeSuccess<T> | GitHubNodeError;

/**
 * GitHubNode - Main class for executing GitHub operations
 */
export class GitHubNode {
  private octokit: Octokit;

  constructor(private accessToken: string) {
    if (!accessToken) {
      throw new Error('GitHubNode requires a non-empty access token');
    }

    this.octokit = new Octokit({
      auth: accessToken,
      userAgent: USER_AGENT,
    });
  }

  /**
   * Main entry point: executes a resource/operation with given params
   */
  async execute(params: GitHubNodeParams): Promise<GitHubNodeResult> {
    const { resource, operation } = params;

    try {
      switch (resource) {
        case 'repository':
          return await this.handleRepository(operation, params);
        case 'issue':
          return await this.handleIssue(operation, params);
        case 'pullRequest':
          return await this.handlePullRequest(operation, params);
        case 'file':
          return await this.handleFile(operation, params);
        case 'commit':
          return await this.handleCommit(operation, params);
        case 'branch':
          return await this.handleBranch(operation, params);
        case 'release':
          return await this.handleRelease(operation, params);
        case 'workflow':
          return await this.handleWorkflow(operation, params);
        default:
          return this.error(resource, operation, `Unsupported resource: ${resource}`);
      }
    } catch (err) {
      return this.handleError(resource, operation, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Repository operations
  // ---------------------------------------------------------------------------

  private async handleRepository(
    operation: GitHubOperation,
    p: GitHubNodeParams
  ): Promise<GitHubNodeResult> {
    switch (operation) {
      case 'getRepo': {
        required(p, ['owner', 'repo']);
        const { owner, repo } = p;
        const { data } = await this.octokit.repos.get({ owner, repo });
        return this.ok('repository', operation, data);
      }

      case 'listRepos': {
        const { org, owner, type } = p;
        let items: any[];
        // If org or owner is provided, list repos for that user/org
        // Use owner if provided (works for both users and orgs), otherwise use org
        const targetUserOrOrg = owner || org;
        if (targetUserOrOrg) {
          // Use listForUser which works for both users and organizations
          items = await this.octokit.paginate(this.octokit.repos.listForUser, {
            username: targetUserOrOrg,
            type: type ?? 'all',
            per_page: 100,
          });
        } else {
          // No owner/org specified, list repos for authenticated user
          items = await this.octokit.paginate(
            this.octokit.repos.listForAuthenticatedUser,
            {
              visibility: 'all',
              affiliation: 'owner,collaborator,organization_member',
              per_page: 100,
            }
          );
        }
        return this.ok('repository', operation, items);
      }
      
      case 'listContributors': {
        required(p, ['owner', 'repo']);
        const { owner, repo } = p;
        const params: any = cleanUndefined({
          owner,
          repo,
          per_page: 100,
        });
        const data = await this.octokit.paginate(
          this.octokit.repos.listContributors,
          params
        );
        return this.ok('repository', operation, data);
      }

      case 'createRepo': {
        required(p, ['name']);
        const { name, org } = p;
        const payload: any = {
          name,
          description: p.description,
          private: p.private ?? false,
          homepage: p.homepage,
          has_issues: p.has_issues ?? true,
          has_wiki: p.has_wiki ?? true,
          auto_init: p.auto_init ?? true,
        };

        const { data } = org
          ? await this.octokit.repos.createInOrg({ org, ...payload })
          : await this.octokit.repos.createForAuthenticatedUser(payload);
        return this.ok('repository', operation, data);
      }

      case 'updateRepo': {
        required(p, ['owner', 'repo']);
        const { owner, repo } = p;
        const payload: any = cleanUndefined({
          name: p.name,
          description: p.description,
          private: p.private,
          homepage: p.homepage,
          default_branch: p.default_branch,
          archived: p.archived,
        });
        const { data } = await this.octokit.repos.update({
          owner,
          repo,
          ...payload,
        });
        return this.ok('repository', operation, data);
      }

      case 'deleteRepo': {
        required(p, ['owner', 'repo']);
        const { owner, repo } = p;
        await this.octokit.repos.delete({ owner, repo });
        return this.ok('repository', operation, { deleted: true });
      }

      default:
        return this.error('repository', operation, `Unsupported repository operation: ${operation}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Issue operations
  // ---------------------------------------------------------------------------

  private async handleIssue(
    operation: GitHubOperation,
    p: GitHubNodeParams
  ): Promise<GitHubNodeResult> {
    switch (operation) {
      case 'getIssue': {
        required(p, ['owner', 'repo', 'issue_number']);
        const { owner, repo, issue_number } = p;
        const { data } = await this.octokit.issues.get({
          owner,
          repo,
          issue_number,
        });
        return this.ok('issue', operation, data);
      }

      case 'listIssues': {
        required(p, ['owner', 'repo']);
        const { owner, repo, state, labels, assignee, creator, mentioned, since } = p;
        const params: any = cleanUndefined({
          owner,
          repo,
          state,
          labels,
          assignee,
          creator,
          mentioned,
          since,
          per_page: 100,
        });
        const data = await this.octokit.paginate(
          this.octokit.issues.listForRepo,
          params
        );
        return this.ok('issue', operation, data);
      }

      case 'createIssue': {
        required(p, ['owner', 'repo', 'title']);
        const { owner, repo, title } = p;
        const payload: any = cleanUndefined({
          owner,
          repo,
          title,
          body: p.body,
          assignees: p.assignees,
          labels: p.labels,
          milestone: p.milestone,
        });
        const { data } = await this.octokit.issues.create(payload);
        return this.ok('issue', operation, data);
      }

      case 'updateIssue': {
        required(p, ['owner', 'repo', 'issue_number']);
        const { owner, repo, issue_number } = p;
        const payload: any = cleanUndefined({
          owner,
          repo,
          issue_number,
          title: p.title,
          body: p.body,
          state: p.state,
          assignees: p.assignees,
          labels: p.labels,
          milestone: p.milestone,
        });
        const { data } = await this.octokit.issues.update(payload);
        return this.ok('issue', operation, data);
      }

      case 'addIssueComment': {
        required(p, ['owner', 'repo', 'issue_number', 'body']);
        const { owner, repo, issue_number, body } = p;
        const { data } = await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number,
          body,
        });
        return this.ok('issue', operation, data);
      }

      case 'lockIssue': {
        required(p, ['owner', 'repo', 'issue_number']);
        const { owner, repo, issue_number } = p;
        await this.octokit.issues.lock({
          owner,
          repo,
          issue_number,
          lock_reason: p.lock_reason,
        });
        return this.ok('issue', operation, { locked: true });
      }

      case 'unlockIssue': {
        required(p, ['owner', 'repo', 'issue_number']);
        const { owner, repo, issue_number } = p;
        await this.octokit.issues.unlock({ owner, repo, issue_number });
        return this.ok('issue', operation, { locked: false });
      }

      default:
        return this.error('issue', operation, `Unsupported issue operation: ${operation}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Pull Request operations
  // ---------------------------------------------------------------------------

  private async handlePullRequest(
    operation: GitHubOperation,
    p: GitHubNodeParams
  ): Promise<GitHubNodeResult> {
    switch (operation) {
      case 'getPullRequest': {
        required(p, ['owner', 'repo', 'pull_number']);
        const { owner, repo, pull_number } = p;
        const { data } = await this.octokit.pulls.get({
          owner,
          repo,
          pull_number,
        });
        return this.ok('pullRequest', operation, data);
      }

      case 'listPullRequests': {
        required(p, ['owner', 'repo']);
        const { owner, repo, state, head, base, sort, direction } = p;
        const params: any = cleanUndefined({
          owner,
          repo,
          state,
          head,
          base,
          sort,
          direction,
          per_page: 100,
        });
        const data = await this.octokit.paginate(
          this.octokit.pulls.list,
          params
        );
        return this.ok('pullRequest', operation, data);
      }

      case 'createPullRequest': {
        required(p, ['owner', 'repo', 'title', 'head', 'base']);
        const { owner, repo, title, head, base } = p;
        const payload: any = cleanUndefined({
          owner,
          repo,
          title,
          head,
          base,
          body: p.body,
          maintainer_can_modify: p.maintainer_can_modify ?? true,
          draft: p.draft,
        });
        const { data } = await this.octokit.pulls.create(payload);
        return this.ok('pullRequest', operation, data);
      }

      case 'updatePullRequest': {
        required(p, ['owner', 'repo', 'pull_number']);
        const { owner, repo, pull_number } = p;
        const payload: any = cleanUndefined({
          owner,
          repo,
          pull_number,
          title: p.title,
          body: p.body,
          state: p.state,
          base: p.base,
        });
        const { data } = await this.octokit.pulls.update(payload);
        return this.ok('pullRequest', operation, data);
      }

      case 'mergePullRequest': {
        required(p, ['owner', 'repo', 'pull_number']);
        const { owner, repo, pull_number } = p;
        const payload: any = cleanUndefined({
          owner,
          repo,
          pull_number,
          commit_title: p.commit_title,
          commit_message: p.commit_message,
          merge_method: p.merge_method, // merge | squash | rebase
        });
        const { data } = await this.octokit.pulls.merge(payload);
        return this.ok('pullRequest', operation, data);
      }

      case 'requestReviewers': {
        required(p, ['owner', 'repo', 'pull_number']);
        const { owner, repo, pull_number } = p;
        const payload: any = cleanUndefined({
          owner,
          repo,
          pull_number,
          reviewers: p.reviewers,
          team_reviewers: p.team_reviewers,
        });
        const { data } = await this.octokit.pulls.requestReviewers(payload);
        return this.ok('pullRequest', operation, data);
      }

      default:
        return this.error('pullRequest', operation, `Unsupported pull request operation: ${operation}`);
    }
  }

  // ---------------------------------------------------------------------------
  // File / Content operations
  // ---------------------------------------------------------------------------

  private async handleFile(
    operation: GitHubOperation,
    p: GitHubNodeParams
  ): Promise<GitHubNodeResult> {
    switch (operation) {
      case 'getContents': {
        required(p, ['owner', 'repo', 'path']);
        const { owner, repo, path, ref } = p;
        const { data } = await this.octokit.repos.getContent(
          cleanUndefined({ owner, repo, path, ref }) as any
        );
        return this.ok('file', operation, data);
      }

      case 'createOrUpdateFile': {
        required(p, ['owner', 'repo', 'path', 'message', 'content']);
        const { owner, repo, path, message, content } = p;
        // If content is not base64, encode it
        const base64Content = Buffer.from(content).toString('base64');
        const payload: any = cleanUndefined({
          owner,
          repo,
          path,
          message,
          content: base64Content,
          branch: p.branch,
          sha: p.sha, // required for update
        });
        const { data } = await this.octokit.repos.createOrUpdateFileContents(payload);
        return this.ok('file', operation, data);
      }

      case 'deleteFile': {
        required(p, ['owner', 'repo', 'path', 'message', 'sha']);
        const { owner, repo, path, message, sha } = p;
        const payload: any = cleanUndefined({
          owner,
          repo,
          path,
          message,
          sha,
          branch: p.branch,
        });
        const { data } = await this.octokit.repos.deleteFile(payload);
        return this.ok('file', operation, data);
      }

      default:
        return this.error('file', operation, `Unsupported file operation: ${operation}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Commit operations
  // ---------------------------------------------------------------------------

  private async handleCommit(
    operation: GitHubOperation,
    p: GitHubNodeParams
  ): Promise<GitHubNodeResult> {
    switch (operation) {
      case 'listCommits': {
        required(p, ['owner', 'repo']);
        const { owner, repo, sha, path, author, since, until } = p;
        const params: any = cleanUndefined({
          owner,
          repo,
          sha,
          path,
          author,
          since,
          until,
          per_page: 100,
        });
        const data = await this.octokit.paginate(
          this.octokit.repos.listCommits,
          params
        );
        return this.ok('commit', operation, data);
      }

      case 'getCommit': {
        required(p, ['owner', 'repo', 'commit_sha']);
        const { owner, repo, commit_sha } = p;
        const { data } = await this.octokit.repos.getCommit({
          owner,
          repo,
          ref: commit_sha,
        });
        return this.ok('commit', operation, data);
      }

      default:
        return this.error('commit', operation, `Unsupported commit operation: ${operation}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Branch operations
  // ---------------------------------------------------------------------------

  private async handleBranch(
    operation: GitHubOperation,
    p: GitHubNodeParams
  ): Promise<GitHubNodeResult> {
    switch (operation) {
      case 'listBranches': {
        required(p, ['owner', 'repo']);
        const { owner, repo } = p;
        const params: any = cleanUndefined({
          owner,
          repo,
          per_page: 100,
        });
        const data = await this.octokit.paginate(
          this.octokit.repos.listBranches,
          params
        );
        return this.ok('branch', operation, data);
      }

      case 'getBranch': {
        required(p, ['owner', 'repo', 'branch']);
        const { owner, repo, branch } = p;
        const { data } = await this.octokit.repos.getBranch({
          owner,
          repo,
          branch,
        });
        return this.ok('branch', operation, data);
      }

      case 'createBranch': {
        required(p, ['owner', 'repo', 'branch', 'sha']);
        const { owner, repo, branch, sha } = p;
        const ref = `refs/heads/${branch}`;
        const { data } = await this.octokit.git.createRef({
          owner,
          repo,
          ref,
          sha,
        });
        return this.ok('branch', operation, data);
      }

      case 'deleteBranch': {
        required(p, ['owner', 'repo', 'branch']);
        const { owner, repo, branch } = p;
        const ref = `heads/${branch}`;
        await this.octokit.git.deleteRef({ owner, repo, ref });
        return this.ok('branch', operation, { deleted: true });
      }

      default:
        return this.error('branch', operation, `Unsupported branch operation: ${operation}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Release operations
  // ---------------------------------------------------------------------------

  private async handleRelease(
    operation: GitHubOperation,
    p: GitHubNodeParams
  ): Promise<GitHubNodeResult> {
    switch (operation) {
      case 'getRelease': {
        required(p, ['owner', 'repo', 'release_id']);
        const { owner, repo, release_id } = p;
        const { data } = await this.octokit.repos.getRelease({
          owner,
          repo,
          release_id,
        });
        return this.ok('release', operation, data);
      }

      case 'listReleases': {
        required(p, ['owner', 'repo']);
        const { owner, repo } = p;
        const params: any = cleanUndefined({
          owner,
          repo,
          per_page: 100,
        });
        const data = await this.octokit.paginate(
          this.octokit.repos.listReleases,
          params
        );
        return this.ok('release', operation, data);
      }

      case 'createRelease': {
        required(p, ['owner', 'repo', 'tag_name']);
        const { owner, repo, tag_name } = p;
        const payload: any = cleanUndefined({
          owner,
          repo,
          tag_name,
          name: p.name,
          body: p.body,
          draft: p.draft,
          prerelease: p.prerelease,
          target_commitish: p.target_commitish,
        });
        const { data } = await this.octokit.repos.createRelease(payload);
        return this.ok('release', operation, data);
      }

      case 'updateRelease': {
        required(p, ['owner', 'repo', 'release_id']);
        const { owner, repo, release_id } = p;
        const payload: any = cleanUndefined({
          owner,
          repo,
          release_id,
          tag_name: p.tag_name,
          name: p.name,
          body: p.body,
          draft: p.draft,
          prerelease: p.prerelease,
        });
        const { data } = await this.octokit.repos.updateRelease(payload);
        return this.ok('release', operation, data);
      }

      case 'deleteRelease': {
        required(p, ['owner', 'repo', 'release_id']);
        const { owner, repo, release_id } = p;
        await this.octokit.repos.deleteRelease({
          owner,
          repo,
          release_id,
        });
        return this.ok('release', operation, { deleted: true });
      }

      default:
        return this.error('release', operation, `Unsupported release operation: ${operation}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Workflow / Actions operations
  // ---------------------------------------------------------------------------

  private async handleWorkflow(
    operation: GitHubOperation,
    p: GitHubNodeParams
  ): Promise<GitHubNodeResult> {
    switch (operation) {
      case 'getWorkflowRuns': {
        required(p, ['owner', 'repo']);
        const { owner, repo, workflowId } = p as {
          owner: string;
          repo: string;
          workflowId?: string | number;
        };

        // If workflowId provided, list runs for that workflow; otherwise for entire repo
        if (workflowId) {
          const params: any = cleanUndefined({
            owner,
            repo,
            workflow_id: workflowId,
            per_page: 100,
          });
          const data = await this.octokit.paginate(
            this.octokit.actions.listWorkflowRuns,
            params
          );
          return this.ok('workflow', operation, data);
        } else {
          const params: any = cleanUndefined({
            owner,
            repo,
            per_page: 100,
          });
          const data = await this.octokit.paginate(
            this.octokit.actions.listWorkflowRunsForRepo,
            params
          );
          return this.ok('workflow', operation, data);
        }
      }

      case 'triggerWorkflow': {
        required(p, ['owner', 'repo', 'workflowId', 'ref']);
        const { owner, repo, workflowId, ref } = p as {
          owner: string;
          repo: string;
          workflowId: string | number;
          ref: string;
        };
        await this.octokit.actions.createWorkflowDispatch({
          owner,
          repo,
          workflow_id: workflowId,
          ref,
        });
        return this.ok('workflow', operation, { triggered: true });
      }

      default:
        return this.error('workflow', operation, `Unsupported workflow operation: ${operation}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private ok<T>(
    resource: GitHubResource,
    operation: GitHubOperation,
    data: T
  ): GitHubNodeSuccess<T> {
    return {
      success: true,
      provider: 'github',
      resource,
      operation,
      data,
    };
  }

  private error(
    resource: GitHubResource,
    operation: GitHubOperation,
    message: string,
    statusCode?: number,
    details?: any
  ): GitHubNodeError {
    return {
      success: false,
      provider: 'github',
      resource,
      operation,
      error: {
        message,
        statusCode,
        details,
      },
    };
  }

  private handleError(
    resource: GitHubResource,
    operation: GitHubOperation,
    err: unknown
  ): GitHubNodeError {
    const e = err as Partial<RequestError> & { message?: string };

    const statusCode =
      typeof e.status === 'number'
        ? e.status
        : (e as any).statusCode ?? undefined;

    const documentationUrl =
      (e as any).documentation_url || (e as any).response?.data?.documentation_url;

    console.error(
      `[GitHubNode] Error in ${resource}.${operation}:`,
      statusCode,
      e.message,
      (e as any).response?.data
    );

    return this.error(
      resource,
      operation,
      e.message || 'Unknown GitHub error',
      statusCode,
      (e as any).response?.data
    );
  }
}

// -----------------------------------------------------------------------------
// Utility functions
// -----------------------------------------------------------------------------

/**
 * Ensures required keys exist in an object.
 * Runtime check + compile-time assertion that specified keys are non-nullable.
 */
function required<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): asserts obj is T & { [P in K]-?: NonNullable<T[P]> } {
  const missing = keys.filter((k) => obj[k] === undefined || obj[k] === null);
  if (missing.length > 0) {
    throw new Error(`Missing required parameter(s): ${missing.join(', ')}`);
  }
}

/**
 * Removes undefined keys from an object so we don't send them to GitHub
 */
function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const copy: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) copy[k] = v;
  }
  return copy;
}
