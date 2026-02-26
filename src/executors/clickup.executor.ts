/**
 * ClickUp Node Executor
 * 
 * Comprehensive ClickUp API integration with support for all operations.
 * Uses the clickupNode.js implementation for core functionality.
 * Maintains backward compatibility with existing operation names.
 */

import { run as runClickUpNode } from '../services/clickup/clickupNode';

interface ClickUpNodeData {
  type: string;
  data?: {
    type?: string;
    config?: Record<string, unknown>;
  };
  config?: Record<string, unknown>;
}

interface ClickUpCredentials {
  apiKey?: string;
  teamId?: string;
  baseUrl?: string;
}

/**
 * Maps old operation names (snake_case) to new operation names (camelCase)
 * for backward compatibility
 */
function normalizeOperationName(operation: string): string {
  const operationMap: Record<string, string> = {
    // Old names -> New names
    'create_task': 'createTask',
    'get_tasks_list': 'getTasks',
    'list_tasks': 'getTasks',
    'get_tasks_space': 'getTasks', // Note: This needs spaceId, handled below
    'get_task': 'getTask',
    'update_task': 'updateTask',
    'delete_task': 'deleteTask',
    'add_comment': 'createComment',
    'get_comments': 'getComments',
    'update_status': 'updateTask', // update_status is just updateTask with status field
    'get_teams': 'getTeams',
    'get_spaces': 'getSpaces',
    'get_folders': 'getFolders',
    'get_lists': 'getLists',
    // New operations (already in camelCase)
    'createList': 'createList',
    'getComments': 'getComments',
    'createComment': 'createComment',
    'getTimeEntries': 'getTimeEntries',
    'createTimeEntry': 'createTimeEntry',
  };

  return operationMap[operation] || operation;
}

/**
 * Converts old config format to new operation params format
 */
function convertConfigToParams(
  operation: string,
  config: Record<string, any>,
): Record<string, any> {
  const params: Record<string, any> = {};

  // Map common fields
  if (config.listId) params.listId = config.listId;
  if (config.spaceId) params.spaceId = config.spaceId;
  if (config.folderId) params.folderId = config.folderId;
  if (config.taskId) params.taskId = config.taskId;
  if (config.workspaceId || config.teamId) {
    params.teamId = config.workspaceId || config.teamId;
  }

  // Handle task operations
  if (operation === 'createTask' || operation === 'create_task') {
    // Support both "taskName" and "name"
    const taskName = config.taskName ?? config.name;
    if (taskName) params.name = taskName;
    if (config.taskDescription || config.description) {
      params.description = config.taskDescription || config.description;
    }
    if (config.status) params.status = config.status;
    if (config.priority) params.priority = config.priority;
    if (Array.isArray(config.assignees)) params.assignees = config.assignees;
    if (typeof config.dueDate === 'number') params.due_date = config.dueDate;
    if (typeof config.startDate === 'number') params.start_date = config.startDate;
    if (typeof config.timeEstimate === 'number') params.time_estimate = config.timeEstimate;
  }

  // Handle update_task
  if (operation === 'updateTask' || operation === 'update_task') {
    const taskName = config.taskName ?? config.name;
    if (taskName) params.name = taskName;
    if (config.taskDescription || config.description) {
      params.description = config.taskDescription || config.description;
    }
    if (config.status) params.status = config.status;
    if (config.priority) params.priority = config.priority;
    if (Array.isArray(config.assignees)) params.assignees = config.assignees;
    if (typeof config.dueDate === 'number') params.due_date = config.dueDate;
    if (typeof config.startDate === 'number') params.start_date = config.startDate;
    if (typeof config.timeEstimate === 'number') params.time_estimate = config.timeEstimate;
  }

  // Handle update_status (special case - just status update)
  if (operation === 'update_status') {
    if (config.status) params.status = config.status;
  }

  // Handle getTasks with query parameters
  if (operation === 'getTasks' || operation === 'get_tasks_list' || operation === 'list_tasks') {
    if (config.page !== undefined) params.page = config.page;
    if (config.order_by) params.order_by = config.order_by;
    if (config.reverse !== undefined) params.reverse = config.reverse;
    if (config.subtasks !== undefined) params.subtasks = config.subtasks;
    if (config.statuses) params.statuses = config.statuses;
    if (config.assignees) params.assignees = config.assignees;
    if (config.due_date_gt) params.due_date_gt = config.due_date_gt;
    if (config.due_date_lt) params.due_date_lt = config.due_date_lt;
    if (config.includeClosed !== undefined) params.include_closed = config.includeClosed;
    if (config.archived !== undefined) params.archived = config.archived;
  }

  // Handle get_tasks_space (needs special handling - uses spaceId, not listId)
  if (operation === 'get_tasks_space') {
    // This operation doesn't map directly to getTasks, but we can handle it
    // by using spaceId in params and the operation will need special handling
    // For now, we'll treat it as a special case
  }

  // Handle comments
  if (operation === 'createComment' || operation === 'add_comment') {
    if (config.commentText || config.comment_text) {
      params.commentText = config.commentText || config.comment_text;
    }
    if (config.assignee !== undefined) params.assignee = config.assignee;
    if (config.notify_all !== undefined) params.notify_all = config.notify_all;
  }

  if (operation === 'getComments') {
    if (config.start !== undefined) params.start = config.start;
    if (config.start_id) params.start_id = config.start_id;
  }

  // Handle createList
  if (operation === 'createList') {
    if (config.name) params.name = config.name;
    if (config.content) params.content = config.content;
    if (config.due_date) params.due_date = config.due_date;
    if (config.priority) params.priority = config.priority;
    if (config.assignee) params.assignee = config.assignee;
  }

  // Handle time entries
  if (operation === 'getTimeEntries') {
    if (config.start_date) params.start_date = config.start_date;
    if (config.end_date) params.end_date = config.end_date;
    if (config.assignee) params.assignee = config.assignee;
    if (config.task_id) params.task_id = config.task_id;
    if (config.page !== undefined) params.page = config.page;
  }

  if (operation === 'createTimeEntry') {
    if (config.taskId || config.task_id) params.taskId = config.taskId || config.task_id;
    if (config.description) params.description = config.description;
    if (config.start) params.start = config.start;
    if (config.duration) params.duration = config.duration;
    if (config.end) params.end = config.end;
    if (config.billable !== undefined) params.billable = config.billable;
    if (config.tags) params.tags = config.tags;
  }

  // Copy any remaining config fields that might be operation-specific
  Object.keys(config).forEach((key) => {
    if (
      ![
        'operation',
        'apiKey',
        'clickupApiKey',
        'clickup_api_key',
        'taskName',
        'name',
        'taskDescription',
        'description',
        'taskId',
        'listId',
        'spaceId',
        'folderId',
        'workspaceId',
        'teamId',
        'status',
        'priority',
        'assignees',
        'dueDate',
        'startDate',
        'timeEstimate',
        'commentText',
        'comment_text',
        'includeClosed',
      ].includes(key) &&
      !params[key]
    ) {
      params[key] = config[key];
    }
  });

  return params;
}

export async function executeClickUpNode(
  node: ClickUpNodeData,
  input: any,
  credentials: ClickUpCredentials | null,
): Promise<any> {
  // Support both node.data.config and node.config shapes
  const config: ClickUpNodeData['config'] =
    node.data?.config || node.config || {};

  // Prefer explicit credentials object (used in full workflow execution),
  // but fall back to API key provided directly in node config (used in Debug Node UI).
  const configApiKey =
    (config as any)?.apiKey ||
    (config as any)?.clickupApiKey ||
    (config as any)?.clickup_api_key;
  const apiKey = credentials?.apiKey || configApiKey;

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('Missing ClickUp API Key');
  }

  const operation = (config as any)?.operation;
  if (!operation) {
    throw new Error('ClickUp node is missing required "operation" config');
  }

  // Normalize operation name (convert snake_case to camelCase for backward compatibility)
  let normalizedOperation = normalizeOperationName(operation);

  // Handle special case: get_tasks_space (maps to getTasks with spaceId)
  if (operation === 'get_tasks_space') {
    const spaceId = (config as any)?.spaceId;
    if (!spaceId) {
      throw new Error('spaceId is required for get_tasks_space');
    }

    // Use getTasks operation with spaceId instead of listId
    normalizedOperation = 'getTasks';
    const spaceParams = convertConfigToParams('getTasks', { ...config, spaceId });
    spaceParams.spaceId = spaceId; // Ensure spaceId is set
    delete spaceParams.listId; // Remove listId if present

    const clickupCredentials = {
      apiToken: apiKey,
      teamId: credentials?.teamId || (config as any)?.workspaceId || (config as any)?.teamId,
      baseUrl: credentials?.baseUrl,
    };

    const result = await runClickUpNode(clickupCredentials, {
      name: 'getTasks',
      params: spaceParams,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to get tasks from space');
    }

    return result.data;
  }

  // Convert config to operation params
  const params = convertConfigToParams(normalizedOperation, config as any);

  // Prepare credentials for the comprehensive node
  const clickupCredentials = {
    apiToken: apiKey,
    teamId: credentials?.teamId || (config as any)?.workspaceId || (config as any)?.teamId,
    baseUrl: credentials?.baseUrl,
  };

  // Call the comprehensive ClickUp node
  const result = await runClickUpNode(clickupCredentials, {
    name: normalizedOperation,
    params: params,
  });

  // Handle response - throw error if not successful, return data if successful
  if (!result.success) {
    throw new Error(result.error || 'ClickUp operation failed');
  }

  // Return the data directly (maintains backward compatibility with existing code)
  return result.data;
}

