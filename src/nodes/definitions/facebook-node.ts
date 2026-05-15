import { NodeDefinition } from '../../core/types/node-definition';
import { facebookOperationsByResource } from '../../services/social/facebook/types/operations.types';
import { FacebookResource } from '../../services/social/facebook/types/facebook.types';

const resources = Object.keys(facebookOperationsByResource) as FacebookResource[];

export const facebookNodeDefinition: NodeDefinition = {
  type: 'facebook',
  label: 'Facebook',
  category: 'social',
  description: 'Enterprise Facebook Graph API integration with resource-operation model',
  icon: 'Facebook',
  version: 2,
  inputSchema: {
    resource: {
      type: 'string',
      description: 'Facebook resource',
      required: true,
      default: 'page',
      examples: resources,
    },
    operation: {
      type: 'string',
      description: 'Operation for the selected resource',
      required: true,
      default: 'getAllPages',
      examples: facebookOperationsByResource.page,
    },
    pageId: {
      type: 'string',
      description: 'Facebook page ID',
      required: false,
      default: '',
    },
    postId: {
      type: 'string',
      description: 'Facebook post ID',
      required: false,
      default: '',
    },
    commentId: {
      type: 'string',
      description: 'Facebook comment ID',
      required: false,
      default: '',
    },
    fields: {
      type: 'string',
      description: 'Comma-separated Graph API fields',
      required: false,
      default: '',
    },
    message: {
      type: 'string',
      description: 'Message text (for post/comment/message operations)',
      required: false,
      default: '',
    },
    link: {
      type: 'string',
      description: 'Link URL for link post operations',
      required: false,
      default: '',
    },
    limit: {
      type: 'number',
      description: 'Page size (1-500)',
      required: false,
      default: 25,
      validation: (value) => {
        if (typeof value !== 'number' || value < 1 || value > 500) {
          return 'limit must be a number between 1 and 500';
        }
        return true;
      },
    },
    after: {
      type: 'string',
      description: 'Pagination cursor',
      required: false,
      default: '',
    },
    returnAll: {
      type: 'boolean',
      description: 'Auto-paginate all pages',
      required: false,
      default: false,
    },
    logToSupabase: {
      type: 'boolean',
      description: 'Log operation result to database',
      required: false,
      default: false,
    },
    syncTableName: {
      type: 'string',
      description: 'DB table for operation logs',
      required: false,
      default: 'facebook_operation_logs',
    },
    continueOnError: {
      type: 'boolean',
      description: 'Continue batch processing when one item fails',
      required: false,
      default: false,
    },
    concurrency: {
      type: 'number',
      description: 'Parallel item concurrency',
      required: false,
      default: 5,
    },
  },
  outputSchema: {
    default: {
      type: 'json',
      description: 'Facebook operation result payload',
    },
  },
  requiredInputs: ['resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,
  validateInputs: (inputs) => {
    const errors: string[] = [];
    const resource = String(inputs.resource || '');
    const operation = String(inputs.operation || '');
    if (!resource) errors.push('resource is required');
    if (!operation) errors.push('operation is required');

    if (resource && !resources.includes(resource as FacebookResource)) {
      errors.push(`resource must be one of: ${resources.join(', ')}`);
    } else if (resource) {
      const allowed = facebookOperationsByResource[resource as FacebookResource] || [];
      if (!allowed.includes(operation as any)) {
        errors.push(`operation must be one of: ${allowed.join(', ')}`);
      }
    }

    return { valid: errors.length === 0, errors };
  },
  defaultInputs: () => ({
    resource: 'page',
    operation: 'getAllPages',
    pageId: '',
    postId: '',
    commentId: '',
    fields: '',
    message: '',
    link: '',
    limit: 25,
    after: '',
    returnAll: false,
    logToSupabase: false,
    syncTableName: 'facebook_operation_logs',
    continueOnError: false,
    concurrency: 5,
  }),
};
