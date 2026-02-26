import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Notion Node Definition
 * 
 * Comprehensive integration with Notion API v1.
 * Supports multiple resources (Page, Database, Block, User, Comment, Search)
 * and operations (Get, List, Create, Update, Delete, Archive, Restore, Query, etc.)
 * similar to n8n's Notion node.
 * 
 * Uses @notionhq/client SDK for reliable API interaction with automatic pagination,
 * error handling, and type safety.
 */
export const notionNodeDefinition: NodeDefinition = {
  type: 'notion',
  label: 'Notion',
  category: 'database',
  description: 'Interact with Notion pages, databases, blocks, and more using the Notion API',
  icon: 'Database',
  version: 1,

  inputSchema: {
    resource: {
      type: 'string',
      description: 'Resource type to operate on',
      required: true,
      default: 'page',
      examples: ['page', 'database', 'block', 'user', 'comment', 'search'],
      validation: (value) => {
        const validResources = ['page', 'database', 'block', 'user', 'comment', 'search'];
        if (!validResources.includes(value)) {
          return `Resource must be one of: ${validResources.join(', ')}`;
        }
        return true;
      },
    },
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'get',
      examples: ['get', 'list', 'create', 'update', 'archive', 'restore', 'query', 'appendChildren', 'listChildren', 'delete', 'getMe'],
      validation: (value) => {
        // Operation validation is resource-dependent, so we'll validate in validateInputs
        return true;
      },
    },
    // Page operations
    pageId: {
      type: 'string',
      description: 'Page ID (required for get, update, archive, restore)',
      required: false,
      default: '',
    },
    databaseId: {
      type: 'string',
      description: 'Database ID (required for database operations, optional for creating page in database)',
      required: false,
      default: '',
    },
    parentPageId: {
      type: 'string',
      description: 'Parent Page ID (required for creating page as child)',
      required: false,
      default: '',
    },
    properties: {
      type: 'json',
      description: 'Page properties object (for create/update in database)',
      required: false,
      default: null,
    },
    children: {
      type: 'json',
      description: 'Blocks: array for creating pages/appending, single object for updating blocks',
      required: false,
      default: null,
    },
    // Database operations
    query: {
      type: 'json',
      description: 'Database query object with filter, sorts, start_cursor, page_size',
      required: false,
      default: null,
    },
    title: {
      type: 'json',
      description: 'Database title (array of rich text objects)',
      required: false,
      default: null,
    },
    schema: {
      type: 'json',
      description: 'Database schema/properties object',
      required: false,
      default: null,
    },
    isInline: {
      type: 'boolean',
      description: 'Whether database is inline (for create)',
      required: false,
      default: false,
    },
    // Block operations
    blockId: {
      type: 'string',
      description: 'Block ID (required for block operations)',
      required: false,
      default: '',
    },
    // User operations
    userId: {
      type: 'string',
      description: 'User ID (required for get user)',
      required: false,
      default: '',
    },
    // Comment operations
    commentId: {
      type: 'string',
      description: 'Comment ID (required for get comment)',
      required: false,
      default: '',
    },
    parentDiscussionId: {
      type: 'string',
      description: 'Parent Discussion ID (for create comment)',
      required: false,
      default: '',
    },
    richText: {
      type: 'json',
      description: 'Rich text array (for create comment)',
      required: false,
      default: null,
    },
    // Search operations
    searchQuery: {
      type: 'string',
      description: 'Search query string (optional, omit to list all)',
      required: false,
      default: '',
    },
    filter: {
      type: 'json',
      description: 'Search filter object (e.g., { property: "object", value: "database" })',
      required: false,
      default: null,
    },
    sort: {
      type: 'json',
      description: 'Search sort configuration',
      required: false,
      default: null,
    },
    // Pagination
    pageSize: {
      type: 'number',
      description: 'Number of results per page (max 100)',
      required: false,
      default: 100,
      validation: (value) => {
        if (value && (value < 1 || value > 100)) {
          return 'Page size must be between 1 and 100';
        }
        return true;
      },
    },
    returnAll: {
      type: 'boolean',
      description: 'Return all results (automatically paginate)',
      required: false,
      default: false,
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Notion operation result (varies by operation)',
    },
  },

  requiredInputs: ['resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    // Required fields
    if (!inputs.resource) {
      errors.push('resource field is required');
    }
    if (!inputs.operation) {
      errors.push('operation field is required');
    }

    const resource = inputs.resource;
    const operation = inputs.operation;

    // Resource-specific validation
    if (resource === 'page') {
      if (['get', 'update', 'archive', 'restore'].includes(operation)) {
        if (!inputs.pageId || typeof inputs.pageId !== 'string' || inputs.pageId.trim() === '') {
          errors.push('pageId is required for this operation');
        }
      }
      if (operation === 'create') {
        // Must have either databaseId or parentPageId, but not both
        const hasDatabaseId = inputs.databaseId && typeof inputs.databaseId === 'string' && inputs.databaseId.trim() !== '';
        const hasParentPageId = inputs.parentPageId && typeof inputs.parentPageId === 'string' && inputs.parentPageId.trim() !== '';
        
        if (!hasDatabaseId && !hasParentPageId) {
          errors.push('Either databaseId or parentPageId is required for create page operation');
        }
        if (hasDatabaseId && hasParentPageId) {
          errors.push('Cannot specify both databaseId and parentPageId for create page operation');
        }
        if (hasDatabaseId && !inputs.properties) {
          errors.push('properties is required when creating page in database');
        }
        if (hasParentPageId && (!inputs.children || !Array.isArray(inputs.children) || inputs.children.length === 0)) {
          errors.push('children (blocks array) is required when creating page as child');
        }
      }
    } else if (resource === 'database') {
      if (['get', 'update', 'query'].includes(operation)) {
        if (!inputs.databaseId || typeof inputs.databaseId !== 'string' || inputs.databaseId.trim() === '') {
          errors.push('databaseId is required for this operation');
        }
      }
      if (operation === 'create') {
        if (!inputs.parentPageId || typeof inputs.parentPageId !== 'string' || inputs.parentPageId.trim() === '') {
          errors.push('parentPageId is required for create database operation');
        }
        if (!inputs.title) {
          errors.push('title is required for create database operation');
        }
        if (!inputs.schema) {
          errors.push('schema is required for create database operation');
        }
      }
    } else if (resource === 'block') {
      if (['get', 'listChildren', 'appendChildren', 'update', 'delete'].includes(operation)) {
        if (!inputs.blockId || typeof inputs.blockId !== 'string' || inputs.blockId.trim() === '') {
          errors.push('blockId is required for this operation');
        }
      }
      if (operation === 'appendChildren' && (!inputs.children || !Array.isArray(inputs.children) || inputs.children.length === 0)) {
        errors.push('children (blocks array) is required for appendChildren operation');
      }
      if (operation === 'update' && (!inputs.children || typeof inputs.children !== 'object' || Array.isArray(inputs.children))) {
        errors.push('children (block content object, e.g., {"paragraph": {"rich_text": [...]}}) is required for update operation');
      }
    } else if (resource === 'user') {
      if (operation === 'get' && !inputs.userId) {
        errors.push('userId is required for get user operation');
      }
    } else if (resource === 'comment') {
      if (operation === 'get') {
        if (!inputs.commentId || typeof inputs.commentId !== 'string' || inputs.commentId.trim() === '') {
          errors.push('commentId is required for get comment operation');
        }
      }
      if (operation === 'create') {
        const hasPageId = inputs.pageId && typeof inputs.pageId === 'string' && inputs.pageId.trim() !== '';
        const hasDiscussionId = inputs.parentDiscussionId && typeof inputs.parentDiscussionId === 'string' && inputs.parentDiscussionId.trim() !== '';
        
        if (!hasPageId && !hasDiscussionId) {
          errors.push('Either pageId or parentDiscussionId is required for create comment operation');
        }
        if (!inputs.richText || !Array.isArray(inputs.richText) || inputs.richText.length === 0) {
          errors.push('richText array is required for create comment operation');
        }
      }
      if (operation === 'list') {
        const hasPageId = inputs.pageId && typeof inputs.pageId === 'string' && inputs.pageId.trim() !== '';
        const hasBlockId = inputs.blockId && typeof inputs.blockId === 'string' && inputs.blockId.trim() !== '';
        
        if (!hasPageId && !hasBlockId) {
          errors.push('Either pageId or blockId is required for list comments operation');
        }
      }
    }

    // Validate pageSize
    if (inputs.pageSize && (typeof inputs.pageSize !== 'number' || inputs.pageSize < 1 || inputs.pageSize > 100)) {
      errors.push('pageSize must be a number between 1 and 100');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    resource: 'page',
    operation: 'get',
    pageId: '',
    databaseId: '',
    parentPageId: '',
    properties: null,
    children: null,
    query: null,
    title: null,
    schema: null,
    isInline: false,
    blockId: '',
    userId: '',
    commentId: '',
    parentDiscussionId: '',
    richText: null,
    searchQuery: '',
    filter: null,
    sort: null,
    pageSize: 100,
    returnAll: false,
  }),
};
