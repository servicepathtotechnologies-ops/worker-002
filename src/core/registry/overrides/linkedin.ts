/**
 * ✅ LINKEDIN NODE - Migrated to Registry
 * 
 * LinkedIn integration.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';

export function overrideLinkedin(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  const operationOptions = [
    { label: 'Get My Profile', value: 'get_profile' },
    { label: 'Create Post', value: 'create_post' },
    { label: 'Create Post Media', value: 'create_post_media' },
    { label: 'Create Article', value: 'create_article' },
    { label: 'Delete Post', value: 'delete_post' },
  ];

  const operationContracts: UnifiedNodeDefinition['operationContracts'] = [
    {
      operation: 'get_profile',
      label: 'Get My Profile',
      requiredFields: [],
      optionalFields: [],
      credentialProviders: ['linkedin'],
      outputFields: ['success', 'profile'],
      legacyAliases: ['get_me'],
      status: 'implemented',
    },
    {
      operation: 'create_post',
      label: 'Create Post',
      requiredFields: ['text'],
      optionalFields: ['personUrn', 'visibility'],
      credentialProviders: ['linkedin'],
      outputFields: ['success', 'postId'],
      legacyAliases: ['post'],
      status: 'implemented',
    },
    {
      operation: 'create_post_media',
      label: 'Create Post Media',
      requiredFields: ['mediaUrl'],
      optionalFields: ['text', 'personUrn', 'visibility'],
      credentialProviders: ['linkedin'],
      outputFields: ['success', 'postId', 'assetUrn'],
      legacyAliases: [],
      status: 'implemented',
    },
    {
      operation: 'create_article',
      label: 'Create Article',
      requiredFields: ['articleUrl'],
      optionalFields: ['text', 'personUrn', 'visibility'],
      credentialProviders: ['linkedin'],
      outputFields: ['success', 'postId'],
      legacyAliases: [],
      status: 'implemented',
    },
    {
      operation: 'delete_post',
      label: 'Delete Post',
      requiredFields: ['postId'],
      optionalFields: [],
      credentialProviders: ['linkedin'],
      outputFields: ['success', 'message'],
      legacyAliases: ['postUrn'],
      status: 'implemented',
    },
  ];

  return {
    ...def,
    credentialSchema: {
      requirements: [{
        provider: 'linkedin',
        category: 'oauth',
        required: true,
        description: 'LinkedIn OAuth connection',
        credentialTypeId: 'linkedin_oauth2',
        authType: 'oauth2' as const,
        label: 'LinkedIn Account',
      }],
      credentialFields: ['accessToken'],
    },
    inputSchema: {
      ...def.inputSchema,
      operation: {
        ...def.inputSchema.operation,
        default: 'create_post',
        ui: {
          ...(def.inputSchema.operation?.ui || {}),
          options: operationOptions,
        },
      },
    },
    operationContracts,
    execute: async (context) => {
      return await executeViaLegacyExecutor({ context, schema });
    },
  };
}
