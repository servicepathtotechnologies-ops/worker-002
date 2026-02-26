import { NodeDefinition } from '../../core/types/node-definition';

/**
 * Google Calendar Node Definition
 * 
 * Comprehensive integration with Google Calendar API v3.
 * Supports multiple resources (Calendar, Event, Calendar List, ACL, Settings, Colors, Free/Busy, Watch)
 * and operations (Get, List, Create, Update, Delete, Clear, Quick Add, Move, Import, etc.)
 * similar to n8n's Google Calendar node.
 * 
 * Uses googleapis npm package for reliable API interaction with OAuth 2.0 support,
 * automatic pagination, error handling, and type safety.
 */
export const googleCalendarNodeDefinition: NodeDefinition = {
  type: 'google_calendar',
  label: 'Google Calendar',
  category: 'productivity',
  description: 'Interact with Google Calendar API v3 to manage calendars, events, and more',
  icon: 'Calendar',
  version: 1,

  inputSchema: {
    resource: {
      type: 'string',
      description: 'Resource type to operate on',
      required: true,
      default: 'event',
      examples: ['calendar', 'event', 'calendarList', 'acl', 'settings', 'colors', 'freebusy', 'watch'],
      validation: (value) => {
        const validResources = ['calendar', 'event', 'calendarList', 'acl', 'settings', 'colors', 'freebusy', 'watch'];
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
      default: 'list',
      examples: [
        // Calendar operations
        'get', 'list', 'create', 'update', 'delete', 'clear',
        // Calendar List operations
        'get', 'list', 'update', 'delete',
        // Event operations
        'get', 'list', 'create', 'quickAdd', 'update', 'delete', 'move', 'import',
        // Event Instance operations
        'list',
        // ACL operations
        'get', 'list', 'create', 'update', 'delete',
        // Settings operations
        'get', 'list',
        // Colors operations
        'get',
        // Free/Busy operations
        'query',
        // Watch operations
        'watch', 'stop',
      ],
      validation: (value) => {
        // Operation validation is resource-dependent, so we'll validate in validateInputs
        return true;
      },
    },
    // Common fields
    calendarId: {
      type: 'string',
      description: 'Calendar ID (use "primary" for primary calendar)',
      required: false,
      default: 'primary',
    },
    // Calendar operations
    summary: {
      type: 'string',
      description: 'Calendar/Event summary/title',
      required: false,
      default: '',
    },
    // Event operations
    eventId: {
      type: 'string',
      description: 'Event ID (for get, update, delete, move)',
      required: false,
      default: '',
    },
    start: {
      type: 'json',
      description: 'Event start time (object: {dateTime: "2025-01-01T10:00:00Z", timeZone: "UTC"} or {date: "2025-01-01"} for all-day)',
      required: false,
      default: null,
    },
    end: {
      type: 'json',
      description: 'Event end time (object: {dateTime: "2025-01-01T11:00:00Z", timeZone: "UTC"} or {date: "2025-01-01"} for all-day)',
      required: false,
      default: null,
    },
    eventData: {
      type: 'json',
      description: 'Additional event data (attendees, reminders, recurrence, description, location, etc.)',
      required: false,
      default: null,
    },
    text: {
      type: 'string',
      description: 'Natural language text (for quickAdd operation)',
      required: false,
      default: '',
    },
    sendUpdates: {
      type: 'string',
      description: 'Send notifications: all, externalOnly, or none',
      required: false,
      default: 'all',
      examples: ['all', 'externalOnly', 'none'],
    },
    destinationCalendarId: {
      type: 'string',
      description: 'Destination calendar ID (for move operation)',
      required: false,
      default: '',
    },
    // List/Query parameters
    timeMin: {
      type: 'string',
      description: 'Minimum time (ISO 8601, e.g., 2025-01-01T00:00:00Z)',
      required: false,
      default: '',
    },
    timeMax: {
      type: 'string',
      description: 'Maximum time (ISO 8601 format)',
      required: false,
      default: '',
    },
    maxResults: {
      type: 'number',
      description: 'Maximum number of results (1-2500)',
      required: false,
      default: 250,
      validation: (value) => {
        if (value && (value < 1 || value > 2500)) {
          return 'Max results must be between 1 and 2500';
        }
        return true;
      },
    },
    q: {
      type: 'string',
      description: 'Search query (for list events)',
      required: false,
      default: '',
    },
    singleEvents: {
      type: 'boolean',
      description: 'Expand recurring events into instances',
      required: false,
      default: false,
    },
    orderBy: {
      type: 'string',
      description: 'Order by: startTime or updated',
      required: false,
      default: 'startTime',
      examples: ['startTime', 'updated'],
    },
    returnAll: {
      type: 'boolean',
      description: 'Return all results (automatically paginate)',
      required: false,
      default: false,
    },
    // ACL operations
    ruleId: {
      type: 'string',
      description: 'ACL rule ID (for get, update, delete)',
      required: false,
      default: '',
    },
    role: {
      type: 'string',
      description: 'ACL role: freeBusyReader, reader, writer, owner',
      required: false,
      default: 'reader',
      examples: ['freeBusyReader', 'reader', 'writer', 'owner'],
    },
    scope: {
      type: 'json',
      description: 'ACL scope (e.g., {type: "user", value: "user@example.com"})',
      required: false,
      default: null,
    },
    // Settings operations
    setting: {
      type: 'string',
      description: 'Setting name (e.g., timezone)',
      required: false,
      default: '',
    },
    // Free/Busy operations
    items: {
      type: 'json',
      description: 'Array of calendar IDs (for freebusy query)',
      required: false,
      default: null,
    },
    // Watch operations
    channelId: {
      type: 'string',
      description: 'Channel ID (for stop watch)',
      required: false,
      default: '',
    },
    resourceId: {
      type: 'string',
      description: 'Resource ID (for stop watch)',
      required: false,
      default: '',
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'Google Calendar operation result (varies by operation)',
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
    if (resource === 'calendar') {
      if (['get', 'update', 'delete', 'clear'].includes(operation)) {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for this operation');
        }
      }
      if (operation === 'create') {
        if (!inputs.summary || typeof inputs.summary !== 'string' || inputs.summary.trim() === '') {
          errors.push('summary is required for create calendar operation');
        }
      }
    } else if (resource === 'calendarList') {
      if (['get', 'update', 'delete'].includes(operation)) {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for this operation');
        }
      }
    } else if (resource === 'calendarList') {
      if (['get', 'update', 'delete'].includes(operation)) {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for this operation');
        }
      }
    } else if (resource === 'event') {
      if (['get', 'update', 'delete', 'move'].includes(operation)) {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for this operation');
        }
        if (!inputs.eventId || typeof inputs.eventId !== 'string' || inputs.eventId.trim() === '') {
          errors.push('eventId is required for this operation');
        }
      }
      if (['list', 'create', 'quickAdd'].includes(operation)) {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for this operation');
        }
      }
      if (operation === 'create') {
        if (!inputs.start || typeof inputs.start !== 'object') {
          errors.push('start (object with dateTime/timeZone or date) is required for create event operation');
        }
        if (!inputs.end || typeof inputs.end !== 'object') {
          errors.push('end (object with dateTime/timeZone or date) is required for create event operation');
        }
      }
      if (operation === 'quickAdd') {
        if (!inputs.text || typeof inputs.text !== 'string' || inputs.text.trim() === '') {
          errors.push('text is required for quickAdd operation');
        }
      }
      if (operation === 'move') {
        if (!inputs.destinationCalendarId || typeof inputs.destinationCalendarId !== 'string' || inputs.destinationCalendarId.trim() === '') {
          errors.push('destinationCalendarId is required for move operation');
        }
      }
    } else if (resource === 'eventInstance') {
      if (operation === 'list') {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for list event instances operation');
        }
        if (!inputs.eventId || typeof inputs.eventId !== 'string' || inputs.eventId.trim() === '') {
          errors.push('eventId is required for list event instances operation');
        }
      }
    } else if (resource === 'acl') {
      if (['get', 'update', 'delete'].includes(operation)) {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for this operation');
        }
        if (!inputs.ruleId || typeof inputs.ruleId !== 'string' || inputs.ruleId.trim() === '') {
          errors.push('ruleId is required for this operation');
        }
      }
      if (operation === 'create') {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for create ACL operation');
        }
        if (!inputs.role || typeof inputs.role !== 'string' || inputs.role.trim() === '') {
          errors.push('role is required for create ACL operation');
        }
        if (!inputs.scope || typeof inputs.scope !== 'object') {
          errors.push('scope (object with type and value) is required for create ACL operation');
        }
      }
      if (operation === 'list') {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for list ACL operation');
        }
      }
    } else if (resource === 'settings') {
      if (operation === 'get') {
        if (!inputs.setting || typeof inputs.setting !== 'string' || inputs.setting.trim() === '') {
          errors.push('setting is required for get setting operation');
        }
      }
    } else if (resource === 'freebusy') {
      if (operation === 'query') {
        if (!inputs.timeMin || typeof inputs.timeMin !== 'string' || inputs.timeMin.trim() === '') {
          errors.push('timeMin is required for freebusy query operation');
        }
        if (!inputs.timeMax || typeof inputs.timeMax !== 'string' || inputs.timeMax.trim() === '') {
          errors.push('timeMax is required for freebusy query operation');
        }
      }
    } else if (resource === 'watch') {
      if (operation === 'stop') {
        if (!inputs.channelId || typeof inputs.channelId !== 'string' || inputs.channelId.trim() === '') {
          errors.push('channelId is required for stop watch operation');
        }
        if (!inputs.resourceId || typeof inputs.resourceId !== 'string' || inputs.resourceId.trim() === '') {
          errors.push('resourceId is required for stop watch operation');
        }
      }
      if (operation === 'watch') {
        if (!inputs.calendarId || typeof inputs.calendarId !== 'string' || inputs.calendarId.trim() === '') {
          errors.push('calendarId is required for watch operation');
        }
      }
    }

    // Validate maxResults
    if (inputs.maxResults && (typeof inputs.maxResults !== 'number' || inputs.maxResults < 1 || inputs.maxResults > 2500)) {
      errors.push('maxResults must be a number between 1 and 2500');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    resource: 'event',
    operation: 'list',
    calendarId: 'primary',
    summary: '',
    eventId: '',
    start: null,
    end: null,
    eventData: null,
    text: '',
    sendUpdates: 'all',
    destinationCalendarId: '',
    timeMin: '',
    timeMax: '',
    maxResults: 250,
    q: '',
    singleEvents: false,
    orderBy: 'startTime',
    returnAll: false,
    ruleId: '',
    role: 'reader',
    scope: null,
    setting: '',
    items: null,
    channelId: '',
    resourceId: '',
  }),
};
