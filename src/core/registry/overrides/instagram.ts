/**
 * ✅ INSTAGRAM NODE - Registry Override
 *
 * Instagram Graph API integration.
 * Delegates execution to the social dispatcher with provider: 'instagram'.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeSocialNode } from '../../../services/social/social-dispatcher';

export function overrideInstagram(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {
  const operationOptions = [
    'sendText',
    'sendMedia',
    'sendTemplate',
    'createAndPublish',
    'get',
    'list',
    'hide',
    'unhide',
    'delete',
    'reply',
    'replyDM',
    'getMedia',
    'search',
    'getRecentMedia',
  ].map((value) => ({
    label: value.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    value,
  }));

  const buildtime = {
    default: 'buildtime_ai_once' as const,
    supportsRuntimeAI: true,
    supportsBuildtimeAI: true,
  };
  const structuralBuildtime = {
    default: 'buildtime_ai_once' as const,
    supportsRuntimeAI: false,
    supportsBuildtimeAI: true,
  };
  const manualStatic = {
    default: 'manual_static' as const,
    supportsRuntimeAI: false,
    supportsBuildtimeAI: false,
  };
  const field = (
    base: Record<string, unknown>,
    fillMode: typeof buildtime | typeof structuralBuildtime | typeof manualStatic,
    role?: string,
    ownership: 'structural' | 'value' | 'credential' = 'value',
  ): any => ({
    ...base,
    ownership,
    fillMode,
    ...(role ? { role } : {}),
  });

  return {
    ...def,
    type: 'instagram',
    label: 'Instagram',
    category: 'social_media',
    description: 'Publish content, send DMs, moderate comments via Instagram Graph API',
    icon: '📸',
    version: '1.0.0',
    isBranching: false,
    incomingPorts: ['default'],
    outgoingPorts: ['default'],
    credentialSchema: {
      requirements: [
        {
          provider: 'facebook',
          category: 'oauth',
          required: true,
          description: 'Facebook OAuth token with Instagram permissions',
          scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_messages', 'pages_show_list'],
        },
      ],
    },
    inputSchema: {
      resource: field({ type: 'string', description: 'Instagram resource', required: true, default: 'message', examples: ['message', 'media', 'comment', 'user', 'insights', 'hashtag'] }, structuralBuildtime, 'config', 'structural'),
      operation: field({ type: 'string', description: 'Instagram operation', required: true, default: 'sendText', examples: operationOptions.map((option) => option.value), ui: { options: operationOptions } }, structuralBuildtime, 'config', 'structural'),
      instagramBusinessAccountId: field({ type: 'string', description: 'Instagram Business Account ID (auto-resolved if absent)', required: false }, manualStatic, 'id'),
      recipientId: field({ type: 'string', description: 'Recipient user ID for DMs', required: false }, buildtime, 'recipient'),
      text: field({ type: 'string', description: 'Message text', required: false }, buildtime, 'long_body'),
      attachmentType: field({ type: 'string', description: 'Attachment type for DMs', required: false, examples: ['image', 'audio', 'video'] }, buildtime, 'config'),
      attachmentUrl: field({ type: 'string', description: 'Attachment URL for DMs', required: false }, buildtime, 'config'),
      media_type: field({ type: 'string', description: 'Media type for publishing', required: false, examples: ['IMAGE', 'VIDEO', 'REELS', 'CAROUSEL_ALBUM'] }, buildtime, 'config'),
      media_url: field({ type: 'string', description: 'Media URL for publishing', required: false }, buildtime, 'config'),
      caption: field({ type: 'string', description: 'Media caption', required: false }, buildtime, 'long_body'),
      location_id: field({ type: 'string', description: 'Location ID for media', required: false }, buildtime, 'id'),
      user_tags: field({ type: 'array', description: 'User tags for media', required: false }, buildtime, 'raw_json'),
      product_tags: field({ type: 'array', description: 'Product tags for media', required: false }, buildtime, 'raw_json'),
      carouselItems: field({ type: 'array', description: 'Array of media URLs for carousel', required: false }, buildtime, 'raw_json'),
      mediaId: field({ type: 'string', description: 'Media ID', required: false }, buildtime, 'id'),
      commentId: field({ type: 'string', description: 'Comment ID', required: false }, buildtime, 'id'),
      replyText: field({ type: 'string', description: 'Reply text for comments', required: false }, buildtime, 'long_body'),
      metric: field({ type: 'string', description: 'Insights metric name', required: false }, buildtime, 'config'),
      period: field({ type: 'string', description: 'Insights period', required: false, default: 'day', examples: ['day', 'week', 'days_28', 'lifetime'] }, buildtime, 'config'),
      since: field({ type: 'string', description: 'Insights start date (ISO 8601)', required: false }, buildtime, 'config'),
      until: field({ type: 'string', description: 'Insights end date (ISO 8601)', required: false }, buildtime, 'config'),
      hashtagName: field({ type: 'string', description: 'Hashtag name to search', required: false }, buildtime, 'short_summary'),
      hashtagId: field({ type: 'string', description: 'Hashtag ID for recent media', required: false }, buildtime, 'id'),
      limit: field({ type: 'number', description: 'Pagination limit', required: false, default: 20 }, buildtime),
      after: field({ type: 'string', description: 'Pagination cursor', required: false }, manualStatic, 'id'),
      returnAll: field({ type: 'boolean', description: 'Return all results (ignores limit)', required: false, default: false }, buildtime),
    },
    outputSchema: {
      default: {
        name: 'default',
        description: 'Instagram operation result',
        schema: {
          type: 'object',
          properties: {
            mediaId: { type: 'string' },
            data: { type: 'object' },
            error: { type: 'object' },
          },
        },
      },
    },
    requiredInputs: ['resource', 'operation'],
    defaultConfig: () => ({
      resource: 'message',
      operation: 'sendText',
      returnAll: false,
      limit: 20,
      period: 'day',
    }),
    validateConfig: (config) => {
      const errors: string[] = [];
      if (!config.resource) errors.push('resource is required');
      if (!config.operation) errors.push('operation is required');
      return { valid: errors.length === 0, errors };
    },
    execute: async (context) => {
      try {
        const { db, userId, currentUserId, config } = context;
        const result = await executeSocialNode(db, { provider: 'instagram', operation: config.operation ?? 'sendText', ...config }, userId, currentUserId);
        return {
          success: result.success,
          output: result.data,
          error: result.error ? { code: 'INSTAGRAM_ERROR', message: result.error } : undefined,
        };
      } catch (err: any) {
        return {
          success: false,
          error: { code: 'INSTAGRAM_ERROR', message: err?.message ?? String(err) },
        };
      }
    },
  };
}
