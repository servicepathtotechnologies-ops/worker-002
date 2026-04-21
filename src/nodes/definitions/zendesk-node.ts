/**
 * Zendesk Node Definition
 *
 * Zendesk REST API integration.
 * Supports operations: get_tickets, get_ticket, create_ticket, update_ticket, delete_ticket, get_users.
 *
 * Authentication: HTTP Basic Auth using {email}/token:{apiToken} Base64-encoded.
 * The apiToken is NEVER logged — only operation and subdomain are logged.
 */

import { NodeDefinition } from '../../core/types/node-definition';

const VALID_OPERATIONS = [
  'get_tickets',
  'get_ticket',
  'create_ticket',
  'update_ticket',
  'delete_ticket',
  'get_users',
] as const;

export const zendeskNodeDefinition: NodeDefinition = {
  type: 'zendesk',
  label: 'Zendesk',
  category: 'crm',
  description: 'Create, read, update, and delete Zendesk support tickets and manage users via the Zendesk REST API using HTTP Basic Auth.',
  icon: 'Headphones',
  version: 1,

  inputSchema: {
    // ── Operation ─────────────────────────────────────────────────────────────
    operation: {
      type: 'string',
      description: 'The Zendesk action to perform',
      required: true,
      default: 'get_tickets',
      examples: ['get_tickets', 'get_ticket', 'create_ticket', 'update_ticket', 'delete_ticket', 'get_users'],
      ui: {
        options: [
          { label: 'Get Tickets', value: 'get_tickets' },
          { label: 'Get Ticket', value: 'get_ticket' },
          { label: 'Create Ticket', value: 'create_ticket' },
          { label: 'Update Ticket', value: 'update_ticket' },
          { label: 'Delete Ticket', value: 'delete_ticket' },
          { label: 'Get Users', value: 'get_users' },
        ],
      },
    },
    // ── Auth / Connection ─────────────────────────────────────────────────────
    subdomain: {
      type: 'string',
      description: 'Zendesk account subdomain (e.g. mycompany → https://mycompany.zendesk.com)',
      required: true,
      default: '',
      examples: ['mycompany'],
    },
    email: {
      type: 'string',
      description: 'Agent email address for Basic Auth',
      required: true,
      default: '',
      examples: ['agent@example.com'],
    },
    apiToken: {
      type: 'string',
      description: 'Zendesk API token — sensitive, never logged',
      required: true,
      default: '',
    },
    // ── Ticket targeting ──────────────────────────────────────────────────────
    ticketId: {
      type: 'string',
      description: 'Ticket ID — required for get_ticket, update_ticket, delete_ticket',
      required: false,
      default: '',
      examples: ['{{$json.id}}', '12345'],
      ui: {
        visibleIf: { field: 'operation', equals: 'get_ticket' },
      },
    },
    // ── Ticket fields ─────────────────────────────────────────────────────────
    subject: {
      type: 'string',
      description: 'Ticket subject — required for create_ticket',
      required: false,
      default: '',
    },
    description: {
      type: 'string',
      description: 'Ticket body / comment for create_ticket',
      required: false,
      default: '',
      ui: {
        widget: 'textarea',
      },
    },
    status: {
      type: 'string',
      description: 'Ticket status',
      required: false,
      default: 'open',
      examples: ['new', 'open', 'pending', 'hold', 'solved', 'closed'],
      ui: {
        options: [
          { label: 'New', value: 'new' },
          { label: 'Open', value: 'open' },
          { label: 'Pending', value: 'pending' },
          { label: 'Hold', value: 'hold' },
          { label: 'Solved', value: 'solved' },
          { label: 'Closed', value: 'closed' },
        ],
      },
    },
    priority: {
      type: 'string',
      description: 'Ticket priority',
      required: false,
      default: 'normal',
      examples: ['low', 'normal', 'high', 'urgent'],
      ui: {
        options: [
          { label: 'Low', value: 'low' },
          { label: 'Normal', value: 'normal' },
          { label: 'High', value: 'high' },
          { label: 'Urgent', value: 'urgent' },
        ],
      },
    },
    assigneeId: {
      type: 'string',
      description: 'Zendesk agent ID to assign the ticket to (for update_ticket)',
      required: false,
      default: '',
      examples: ['{{$json.assignee_id}}'],
    },
    // ── List options ──────────────────────────────────────────────────────────
    limit: {
      type: 'number',
      description: 'Number of records per page for get_tickets and get_users',
      required: false,
      default: 25,
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

  requiredInputs: ['operation', 'subdomain', 'email', 'apiToken'],
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

    if (!inputs.subdomain?.trim()) errors.push('subdomain is required');
    if (!inputs.email?.trim()) errors.push('email is required');
    if (!inputs.apiToken?.trim()) errors.push('apiToken is required');

    if (['get_ticket', 'update_ticket', 'delete_ticket'].includes(inputs.operation) && !inputs.ticketId?.trim()) {
      errors.push(`ticketId is required for ${inputs.operation}`);
    }

    if (inputs.operation === 'create_ticket' && !inputs.subject?.trim()) {
      errors.push('subject is required for create_ticket');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    operation: 'get_tickets',
    subdomain: '',
    email: '',
    apiToken: '',
    ticketId: '',
    subject: '',
    description: '',
    status: 'open',
    priority: 'normal',
    assigneeId: '',
    limit: 25,
  }),

  run: async (context) => {
    const {
      operation,
      subdomain,
      email,
      apiToken,
      ticketId,
      subject,
      description,
      status,
      priority,
      assigneeId,
      limit,
    } = context.inputs;

    const baseUrl = `https://${subdomain}.zendesk.com/api/v2`;
    const authHeader = `Basic ${Buffer.from(`${email}/token:${apiToken}`).toString('base64')}`;

    // Only log non-sensitive fields — never log apiToken
    console.log(`[zendesk] operation=${operation} subdomain=${subdomain}`);

    try {
      let response: Response;

      if (operation === 'get_tickets') {
        response = await fetch(`${baseUrl}/tickets.json?per_page=${limit}`, {
          method: 'GET',
          headers: { 'Authorization': authHeader },
        });
      } else if (operation === 'get_ticket') {
        response = await fetch(`${baseUrl}/tickets/${ticketId}.json`, {
          method: 'GET',
          headers: { 'Authorization': authHeader },
        });
      } else if (operation === 'create_ticket') {
        response = await fetch(`${baseUrl}/tickets.json`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ticket: {
              subject,
              comment: { body: description },
              status,
              priority,
            },
          }),
        });
      } else if (operation === 'update_ticket') {
        // Only include non-empty fields to avoid overwriting existing values with blanks
        const ticketUpdate: Record<string, unknown> = {};
        if (subject?.trim()) ticketUpdate.subject = subject;
        if (status?.trim()) ticketUpdate.status = status;
        if (priority?.trim()) ticketUpdate.priority = priority;
        if (assigneeId?.trim()) ticketUpdate.assignee_id = assigneeId;

        response = await fetch(`${baseUrl}/tickets/${ticketId}.json`, {
          method: 'PUT',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ticket: ticketUpdate }),
        });
      } else if (operation === 'delete_ticket') {
        response = await fetch(`${baseUrl}/tickets/${ticketId}.json`, {
          method: 'DELETE',
          headers: { 'Authorization': authHeader },
        });
      } else {
        // get_users
        response = await fetch(`${baseUrl}/users.json?per_page=${limit}`, {
          method: 'GET',
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
