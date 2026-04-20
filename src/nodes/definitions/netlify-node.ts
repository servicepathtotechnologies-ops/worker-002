/**
 * Netlify Node Definition
 *
 * Netlify REST API integration.
 * Supports resources: sites, deploys, forms.
 * Operations: list_sites, get_site, create_deploy, list_deploys, get_deploy.
 *
 * Authentication: Personal Access Token passed as Authorization: Bearer <token>.
 * Base URL: https://api.netlify.com/api/v1
 */

import { NodeDefinition } from '../../core/types/node-definition';

export const netlifyNodeDefinition: NodeDefinition = {
  type: 'netlify',
  label: 'Netlify',
  category: 'devops',
  description: 'Deploy sites, manage builds, and query site/deploy/form data through the Netlify REST API.',
  icon: 'Globe',
  version: 1,

  inputSchema: {
    // ── Auth ─────────────────────────────────────────────────────────────────
    accessToken: {
      type: 'string',
      description: 'Netlify Personal Access Token (Bearer token)',
      required: false,
      default: '',
      examples: ['{{$credentials.netlify.accessToken}}'],
    },
    // ── Resource / Operation ─────────────────────────────────────────────────
    resource: {
      type: 'string',
      description: 'Netlify API resource to target',
      required: true,
      default: 'sites',
      examples: ['sites', 'deploys', 'forms'],
      ui: {
        options: [
          { label: 'Sites', value: 'sites' },
          { label: 'Deploys', value: 'deploys' },
          { label: 'Forms', value: 'forms' },
        ],
      },
    },
    operation: {
      type: 'string',
      description: 'Action to perform on the selected resource',
      required: true,
      default: 'list_sites',
      examples: ['list_sites', 'get_site', 'create_deploy', 'list_deploys', 'get_deploy'],
      ui: {
        options: [
          { label: 'List Sites', value: 'list_sites' },
          { label: 'Get Site', value: 'get_site' },
          { label: 'Create Deploy', value: 'create_deploy' },
          { label: 'List Deploys', value: 'list_deploys' },
          { label: 'Get Deploy', value: 'get_deploy' },
        ],
      },
    },
    // ── Record targeting ─────────────────────────────────────────────────────
    siteId: {
      type: 'string',
      description: 'Site ID — required for get_site, create_deploy, list_deploys, get_deploy',
      required: false,
      default: '',
      examples: ['{{$json.id}}', '{{$credentials.netlify.siteId}}'],
    },
    deployId: {
      type: 'string',
      description: 'Deploy ID — required for get_deploy',
      required: false,
      default: '',
      examples: ['{{$json.id}}'],
    },
    // ── Write payload ────────────────────────────────────────────────────────
    payload: {
      type: 'object',
      description: 'Request body for create_deploy operation (e.g. { "branch": "main" })',
      required: false,
      default: {},
    },
    // ── Pagination ───────────────────────────────────────────────────────────
    limit: {
      type: 'number',
      description: 'Maximum number of records to return (per_page)',
      required: false,
      default: 25,
    },
  },

  outputSchema: {
    success: {
      type: 'boolean',
      description: 'True if the API call succeeded',
    },
    resource: {
      type: 'string',
      description: 'Echoed resource name',
    },
    operation: {
      type: 'string',
      description: 'Echoed operation name',
    },
    record: {
      type: 'object',
      description: 'Single record result (get_site, get_deploy, create_deploy)',
    },
    records: {
      type: 'array',
      description: 'List of records (list_sites, list_deploys)',
    },
    count: {
      type: 'number',
      description: 'Number of records returned',
    },
    meta: {
      type: 'object',
      description: 'Raw API response metadata',
    },
    error: {
      type: 'string',
      description: 'Error message if success is false',
    },
  },

  requiredInputs: ['resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    const validResources = ['sites', 'deploys', 'forms'];
    if (!inputs.resource) {
      errors.push('resource is required');
    } else if (!validResources.includes(inputs.resource)) {
      errors.push(`resource must be one of: ${validResources.join(', ')}`);
    }

    const validOps = ['list_sites', 'get_site', 'create_deploy', 'list_deploys', 'get_deploy'];
    if (!inputs.operation) {
      errors.push('operation is required');
    } else if (!validOps.includes(inputs.operation)) {
      errors.push(`operation must be one of: ${validOps.join(', ')}`);
    }

    const siteRequiredOps = ['get_site', 'create_deploy', 'list_deploys', 'get_deploy'];
    if (siteRequiredOps.includes(inputs.operation) && !inputs.siteId?.trim()) {
      errors.push(`siteId is required for ${inputs.operation}`);
    }

    if (inputs.operation === 'get_deploy' && !inputs.deployId?.trim()) {
      errors.push('deployId is required for get_deploy');
    }

    if (inputs.operation === 'create_deploy') {
      if (!inputs.payload || typeof inputs.payload !== 'object') {
        errors.push('payload must be a non-null object for create_deploy');
      }
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    resource: 'sites',
    operation: 'list_sites',
    limit: 25,
    accessToken: '',
    siteId: '',
    deployId: '',
    payload: {},
  }),
};
