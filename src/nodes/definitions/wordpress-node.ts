/**
 * WordPress Node Definition
 *
 * WordPress REST API integration.
 * Supports operations: create_post, get_posts, update_post, delete_post.
 *
 * Authentication: HTTP Basic Auth using WordPress Application Passwords.
 * The username:password pair is Base64-encoded and sent as Authorization: Basic <base64>.
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_OPERATIONS = ['create_post', 'get_posts', 'update_post', 'delete_post'] as const;

export const wordpressNodeDefinition: NodeDefinition = {
  type: 'wordpress',
  label: 'WordPress',
  category: 'cms',
  description: 'Create, read, update, and delete posts on any self-hosted WordPress site via the WordPress REST API using Application Passwords.',
  icon: 'Globe',
  version: 1,

  inputSchema: {
    // ── Operation ─────────────────────────────────────────────────────────────
    operation: {
      type: 'string',
      description: 'The WordPress action to perform',
      required: true,
      default: 'get_posts',
      examples: ['create_post', 'get_posts', 'update_post', 'delete_post'],
      ui: {
        options: [
          { label: 'Create Post', value: 'create_post' },
          { label: 'Get Posts', value: 'get_posts' },
          { label: 'Update Post', value: 'update_post' },
          { label: 'Delete Post', value: 'delete_post' },
        ],
      },
    },
    // ── Auth ──────────────────────────────────────────────────────────────────
    siteUrl: {
      type: 'string',
      description: 'Base URL of the WordPress site (no trailing slash), e.g. https://example.com',
      required: true,
      default: '',
      examples: ['https://example.com', 'https://myblog.com'],
    },
    username: {
      type: 'string',
      description: 'WordPress username — sensitive, never logged',
      required: true,
      default: '',
    },
    password: {
      type: 'string',
      description: 'WordPress Application Password — sensitive, never logged',
      required: true,
      default: '',
    },
    // ── Post targeting ────────────────────────────────────────────────────────
    postId: {
      type: 'string',
      description: 'Post ID for update_post or delete_post operations',
      required: false,
      default: '',
      examples: ['{{$json.id}}', '42'],
    },
    // ── Write payload ─────────────────────────────────────────────────────────
    title: {
      type: 'string',
      description: 'Post title — required for create_post',
      required: false,
      default: '',
    },
    content: {
      type: 'string',
      description: 'Post body HTML/text',
      required: false,
      default: '',
    },
    status: {
      type: 'string',
      description: "Post status: 'publish', 'draft', or 'pending'",
      required: false,
      default: 'publish',
      examples: ['publish', 'draft', 'pending'],
      ui: {
        options: [
          { label: 'Publish', value: 'publish' },
          { label: 'Draft', value: 'draft' },
          { label: 'Pending', value: 'pending' },
        ],
      },
    },
    // ── List options ──────────────────────────────────────────────────────────
    limit: {
      type: 'number',
      description: 'Maximum number of posts to return (per_page) for get_posts',
      required: false,
      default: 10,
    },
  },

  outputSchema: {
    success: {
      type: 'boolean',
      description: 'true if the API returned a 2xx response',
    },
    data: {
      type: 'object',
      description: 'Response body on success, {} on failure',
    },
    error: {
      type: 'object',
      description: 'Error details on failure: { message: string, status: number }',
    },
  },

  requiredInputs: ['operation', 'siteUrl', 'username', 'password'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    if (!inputs.operation) {
      errors.push('operation is required');
    } else if (!VALID_OPERATIONS.includes(inputs.operation as typeof VALID_OPERATIONS[number])) {
      errors.push(`operation must be one of: ${VALID_OPERATIONS.join(', ')}`);
    }

    if (!inputs.siteUrl?.trim()) errors.push('siteUrl is required');
    if (!inputs.username?.trim()) errors.push('username is required');
    if (!inputs.password?.trim()) errors.push('password is required');

    if (['update_post', 'delete_post'].includes(inputs.operation) && !inputs.postId?.trim()) {
      errors.push('postId is required for update_post and delete_post operations');
    }

    if (inputs.operation === 'create_post' && !inputs.title?.trim()) {
      errors.push('title is required for create_post');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    operation: 'get_posts',
    siteUrl: '',
    username: '',
    password: '',
    postId: '',
    title: '',
    content: '',
    status: 'publish',
    limit: 10,
  }),

  run: async (context) => {
    const { operation, siteUrl, username, password, postId, title, content, status, limit } = context.inputs;

    // Build Basic Auth header — credentials are never logged
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const baseUrl = `${siteUrl}/wp-json/wp/v2/posts`;

    console.log(`[wordpress] operation=${operation} siteUrl=${siteUrl}`);

    try {
      let response: Response;

      if (operation === 'create_post') {
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, content, status }),
        });
      } else if (operation === 'get_posts') {
        const url = `${baseUrl}?per_page=${limit ?? 10}`;
        response = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': authHeader },
        });
      } else if (operation === 'update_post') {
        const body: Record<string, string> = {};
        if (title) body.title = title;
        if (content) body.content = content;
        response = await fetch(`${baseUrl}/${postId}`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } else {
        // delete_post
        response = await fetch(`${baseUrl}/${postId}?force=true`, {
          method: 'DELETE',
          headers: { 'Authorization': authHeader },
        });
      }

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return { success: true, data, error: {} };
      } else {
        const message = await response.text().catch(() => response.statusText);
        return { success: false, data: {}, error: { message, status: response.status } };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, data: {}, error: { message, status: 0 } };
    }
  },
};
