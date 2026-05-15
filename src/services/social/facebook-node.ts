/**
 * Facebook node entrypoint for social dispatcher.
 * Provides a full enterprise resource/operation scaffold with one fully implemented operation:
 *   - page.getAllPages
 */

import { resolveFacebookOperationHandler } from './facebook/actions';
import { FacebookApiClient } from './facebook/shared/FacebookApi.client';
import { toFacebookErrorPayload } from './facebook/shared/ErrorHandler.helper';
import { DBLogger } from './facebook/shared/DBLogger.helper';
import { isOperationAllowed } from './facebook/types/operations.types';
import {
  FacebookNodeParams,
  FacebookNodeResult,
  FacebookOperation,
  FacebookResource,
} from './facebook/types/facebook.types';

const legacyOperationAliasMap: Record<string, { resource: FacebookResource; operation: FacebookOperation }> = {
  list: { resource: 'page', operation: 'getAllPages' },
  get: { resource: 'page', operation: 'getPageDetails' },
  update: { resource: 'page', operation: 'updatePageSettings' },
  listPosts: { resource: 'page', operation: 'getPageFeed' },
  createPost: { resource: 'post', operation: 'createTextPost' },
  updatePost: { resource: 'post', operation: 'updatePost' },
  deletePost: { resource: 'post', operation: 'deletePost' },
  getInsights: { resource: 'page', operation: 'getPageInsights' },
  listComments: { resource: 'post', operation: 'getPostComments' },
  createComment: { resource: 'comment', operation: 'createComment' },
  updateComment: { resource: 'comment', operation: 'updateComment' },
  deleteComment: { resource: 'comment', operation: 'deleteComment' },
};

function normalizeLegacyParams(params: FacebookNodeParams): FacebookNodeParams {
  const operationKey = String(params.operation || '');
  const alias = legacyOperationAliasMap[operationKey];
  if (!alias) return params;
  return {
    ...params,
    resource: (params.resource || alias.resource) as FacebookResource,
    operation: alias.operation,
  };
}

export class FacebookNode {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    if (!accessToken) {
      throw new Error('Facebook access token is required');
    }
    this.accessToken = accessToken;
  }

  async execute(input: FacebookNodeParams): Promise<FacebookNodeResult> {
    const startedAt = Date.now();
    const params = normalizeLegacyParams(input);
    const logger = new DBLogger({
      enabled: Boolean(params.logToSupabase),
      tableName: String(params.syncTableName || 'facebook_operation_logs'),
    });
    const client = new FacebookApiClient({
      accessToken: String(params.accessToken || this.accessToken),
    });

    try {
      if (!isOperationAllowed(params.resource, params.operation)) {
        throw new Error(`Operation ${params.operation} is not supported for resource ${params.resource}`);
      }

      await client.validateToken();
      const handler = resolveFacebookOperationHandler(params);
      const result = await handler(client, params);
      const executionTimeMs = Date.now() - startedAt;
      const apiCallCount = client.getApiCallCount();

      await logger.log({
        operation: `${params.resource}.${params.operation}`,
        page_id: params.pageId ?? null,
        response_data: result.data,
        status: 'success',
        execution_time_ms: executionTimeMs,
        api_call_count: apiCallCount,
        sync_to_supabase: Boolean(params.logToSupabase),
      });

      return {
        success: true,
        resource: params.resource,
        operation: params.operation,
        data: result.data,
        error: null,
        pagination: result.pagination,
        meta: {
          executionTimeMs,
          apiCallCount,
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startedAt;
      const apiCallCount = client.getApiCallCount();
      const fbError = toFacebookErrorPayload(error);

      await logger.log({
        operation: `${params.resource}.${params.operation}`,
        page_id: params.pageId ?? null,
        response_data: {},
        status: 'failed',
        error_message: fbError.message,
        execution_time_ms: executionTimeMs,
        api_call_count: apiCallCount,
        sync_to_supabase: Boolean(params.logToSupabase),
      });

      return {
        success: false,
        resource: params.resource,
        operation: params.operation,
        data: {},
        error: fbError,
        meta: {
          executionTimeMs,
          apiCallCount,
        },
      };
    }
  }
}

export type { FacebookNodeParams, FacebookNodeResult, FacebookOperation, FacebookResource } from './facebook/types/facebook.types';
