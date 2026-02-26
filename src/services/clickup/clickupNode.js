/**
 * ClickUp Node Executor
 * 
 * A comprehensive node for interacting with the ClickUp API (project management platform).
 * Supports teams, spaces, folders, lists, tasks, comments, and time entries.
 * 
 * Usage:
 *   const { run } = require('./clickupNode');
 *   const result = await run(credentials, operation);
 * 
 * @param {Object} credentials - ClickUp API credentials
 * @param {string} credentials.apiToken - Required. Your ClickUp API token (personal token or OAuth access token)
 * @param {string} [credentials.teamId] - Optional. Default Team/Workspace ID
 * @param {string} [credentials.baseUrl] - Optional. Defaults to 'https://api.clickup.com/api/v2'
 * 
 * @param {Object} operation - Operation configuration
 * @param {string} operation.name - Operation name (e.g., 'getTeams', 'createTask', etc.)
 * @param {Object} [operation.params] - Operation-specific parameters
 * 
 * @returns {Promise<Object>} Result object with { success: boolean, data?: any, error?: string }
 */

const axios = require('axios');

/**
 * Validates that required credentials are provided
 */
function validateCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    return { valid: false, error: 'Credentials object is required' };
  }
  
  if (!credentials.apiToken || typeof credentials.apiToken !== 'string' || credentials.apiToken.trim() === '') {
    return { valid: false, error: 'API token is required' };
  }
  
  return { valid: true };
}

/**
 * Validates required parameters for an operation
 */
function validateOperationParams(operationName, params, defaultTeamId) {
  switch (operationName) {
    case 'getTeams':
      // No required parameters
      return { valid: true };
      
    case 'getSpaces':
      // teamId can come from params or credentials
      const teamId = params.teamId || defaultTeamId;
      if (!teamId) {
        return { valid: false, error: 'teamId is required for getSpaces (provide in params or credentials)' };
      }
      return { valid: true };
      
    case 'getFolders':
      if (!params.spaceId) {
        return { valid: false, error: 'spaceId is required for getFolders' };
      }
      return { valid: true };
      
    case 'getLists':
      // Either folderId OR spaceId must be provided
      if (!params.folderId && !params.spaceId) {
        return { valid: false, error: 'Either folderId or spaceId is required for getLists' };
      }
      return { valid: true };
      
    case 'getTasks':
      // Either listId OR spaceId must be provided
      if (!params.listId && !params.spaceId) {
        return { valid: false, error: 'Either listId or spaceId is required for getTasks' };
      }
      return { valid: true };
      
    case 'getTask':
      if (!params.taskId) {
        return { valid: false, error: 'taskId is required for getTask' };
      }
      return { valid: true };
      
    case 'createTask':
      if (!params.listId) {
        return { valid: false, error: 'listId is required for createTask' };
      }
      if (!params.name) {
        return { valid: false, error: 'name is required for createTask' };
      }
      return { valid: true };
      
    case 'updateTask':
      if (!params.taskId) {
        return { valid: false, error: 'taskId is required for updateTask' };
      }
      return { valid: true };
      
    case 'deleteTask':
      if (!params.taskId) {
        return { valid: false, error: 'taskId is required for deleteTask' };
      }
      return { valid: true };
      
    case 'createList':
      // Either folderId OR spaceId must be provided
      if (!params.folderId && !params.spaceId) {
        return { valid: false, error: 'Either folderId or spaceId is required for createList' };
      }
      if (!params.name) {
        return { valid: false, error: 'name is required for createList' };
      }
      return { valid: true };
      
    case 'getComments':
      // Either taskId OR listId must be provided
      if (!params.taskId && !params.listId) {
        return { valid: false, error: 'Either taskId or listId is required for getComments' };
      }
      return { valid: true };
      
    case 'createComment':
      // Either taskId OR listId must be provided
      if (!params.taskId && !params.listId) {
        return { valid: false, error: 'Either taskId or listId is required for createComment' };
      }
      if (!params.commentText) {
        return { valid: false, error: 'commentText is required for createComment' };
      }
      return { valid: true };
      
    case 'getTimeEntries':
      const timeEntriesTeamId = params.teamId || defaultTeamId;
      if (!timeEntriesTeamId) {
        return { valid: false, error: 'teamId is required for getTimeEntries (provide in params or credentials)' };
      }
      return { valid: true };
      
    case 'createTimeEntry':
      const createTimeEntryTeamId = params.teamId || defaultTeamId;
      if (!createTimeEntryTeamId) {
        return { valid: false, error: 'teamId is required for createTimeEntry (provide in params or credentials)' };
      }
      return { valid: true };
      
    default:
      return { valid: false, error: `Unsupported operation: ${operationName}` };
  }
}

/**
 * Builds the request configuration for a ClickUp API operation
 */
function buildRequestConfig(operationName, params, credentials) {
  const baseUrl = credentials.baseUrl || 'https://api.clickup.com/api/v2';
  const defaultTeamId = credentials.teamId;
  
  let method, url, data, query = {};
  
  switch (operationName) {
    case 'getTeams':
      method = 'GET';
      url = `${baseUrl}/team`;
      break;
      
    case 'getSpaces': {
      const teamId = params.teamId || defaultTeamId;
      method = 'GET';
      url = `${baseUrl}/team/${teamId}/space`;
      break;
    }
    
    case 'getFolders':
      method = 'GET';
      url = `${baseUrl}/space/${params.spaceId}/folder`;
      break;
      
    case 'getLists':
      if (params.folderId) {
        method = 'GET';
        url = `${baseUrl}/folder/${params.folderId}/list`;
      } else {
        method = 'GET';
        url = `${baseUrl}/space/${params.spaceId}/list`;
      }
      break;
      
    case 'getTasks': {
      // Support both listId (for list tasks) and spaceId (for space tasks)
      if (params.listId) {
        method = 'GET';
        url = `${baseUrl}/list/${params.listId}/task`;
      } else if (params.spaceId) {
        method = 'GET';
        url = `${baseUrl}/space/${params.spaceId}/task`;
      } else {
        throw new Error('Either listId or spaceId is required for getTasks');
      }
      // Extract query parameters for filtering
      const queryParams = ['page', 'order_by', 'reverse', 'subtasks', 'statuses', 
                          'assignees', 'due_date_gt', 'due_date_lt', 'date_created_gt', 
                          'date_created_lt', 'date_updated_gt', 'date_updated_lt', 
                          'include_closed', 'archived'];
      queryParams.forEach(key => {
        if (params[key] !== undefined) {
          query[key] = params[key];
        }
      });
      break;
    }
    
    case 'getTask':
      method = 'GET';
      url = `${baseUrl}/task/${params.taskId}`;
      break;
      
    case 'createTask': {
      method = 'POST';
      url = `${baseUrl}/list/${params.listId}/task`;
      // Extract all task fields except listId
      const { listId, ...taskData } = params;
      data = taskData;
      break;
    }
    
    case 'updateTask': {
      method = 'PUT';
      url = `${baseUrl}/task/${params.taskId}`;
      // Extract all update fields except taskId
      const { taskId, ...updateData } = params;
      data = updateData;
      break;
    }
    
    case 'deleteTask':
      method = 'DELETE';
      url = `${baseUrl}/task/${params.taskId}`;
      break;
      
    case 'createList': {
      if (params.folderId) {
        method = 'POST';
        url = `${baseUrl}/folder/${params.folderId}/list`;
      } else {
        method = 'POST';
        url = `${baseUrl}/space/${params.spaceId}/list`;
      }
      // Extract list fields
      const { folderId, spaceId, ...listData } = params;
      data = listData;
      break;
    }
    
    case 'getComments': {
      method = 'GET';
      if (params.taskId) {
        url = `${baseUrl}/task/${params.taskId}/comment`;
      } else {
        url = `${baseUrl}/list/${params.listId}/comment`;
      }
      // Extract pagination parameters
      if (params.start !== undefined) query.start = params.start;
      if (params.start_id !== undefined) query.start_id = params.start_id;
      break;
    }
    
    case 'createComment': {
      method = 'POST';
      if (params.taskId) {
        url = `${baseUrl}/task/${params.taskId}/comment`;
      } else {
        url = `${baseUrl}/list/${params.listId}/comment`;
      }
      // Build comment body
      data = {
        comment_text: params.commentText,
      };
      if (params.assignee !== undefined) data.assignee = params.assignee;
      if (params.notify_all !== undefined) data.notify_all = params.notify_all;
      break;
    }
    
    case 'getTimeEntries': {
      const timeEntriesTeamId = params.teamId || defaultTeamId;
      method = 'GET';
      url = `${baseUrl}/team/${timeEntriesTeamId}/time_entries`;
      // Extract query parameters for filtering
      const queryParams = ['start_date', 'end_date', 'assignee', 'task_id', 'include_task_tags', 
                          'include_location_names', 'space_id', 'folder_id', 'list_id', 'page'];
      queryParams.forEach(key => {
        if (params[key] !== undefined) {
          query[key] = params[key];
        }
      });
      break;
    }
    
    case 'createTimeEntry': {
      const createTimeEntryTeamId = params.teamId || defaultTeamId;
      method = 'POST';
      url = `${baseUrl}/team/${createTimeEntryTeamId}/time_entries`;
      // Build time entry body
      data = {};
      if (params.taskId !== undefined) data.task_id = params.taskId;
      if (params.description !== undefined) data.description = params.description;
      if (params.start !== undefined) data.start = params.start;
      if (params.duration !== undefined) data.duration = params.duration;
      if (params.end !== undefined) data.end = params.end;
      if (params.billable !== undefined) data.billable = params.billable;
      if (params.tags !== undefined) data.tags = params.tags;
      break;
    }
    
    default:
      throw new Error(`Unsupported operation: ${operationName}`);
  }
  
  return { method, url, data, query };
}

/**
 * Main function to run a ClickUp node operation
 * 
 * @param {Object} credentials - ClickUp API credentials
 * @param {Object} operation - Operation configuration
 * @returns {Promise<Object>} Result object
 */
async function run(credentials, operation) {
  // Validate credentials
  const credentialValidation = validateCredentials(credentials);
  if (!credentialValidation.valid) {
    return {
      success: false,
      error: credentialValidation.error,
    };
  }
  
  // Validate operation structure
  if (!operation || typeof operation !== 'object') {
    return {
      success: false,
      error: 'Operation object is required',
    };
  }
  
  if (!operation.name || typeof operation.name !== 'string') {
    return {
      success: false,
      error: 'Operation name is required',
    };
  }
  
  const params = operation.params || {};
  
  // Validate operation parameters
  const paramValidation = validateOperationParams(operation.name, params, credentials.teamId);
  if (!paramValidation.valid) {
    return {
      success: false,
      error: paramValidation.error,
    };
  }
  
  // Build request configuration
  let requestConfig;
  try {
    requestConfig = buildRequestConfig(operation.name, params, credentials);
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
  
  const { method, url, data, query } = requestConfig;
  const baseUrl = credentials.baseUrl || 'https://api.clickup.com/api/v2';
  
  // Prepare axios configuration
  const axiosConfig = {
    method,
    url,
    headers: {
      'Authorization': credentials.apiToken, // ClickUp uses token directly, not Bearer for personal tokens
      'Content-Type': 'application/json',
    },
  };
  
  // Add query parameters for GET requests or when specified
  if (Object.keys(query).length > 0) {
    axiosConfig.params = query;
  }
  
  // Add request body for POST/PUT requests
  if (data && (method === 'POST' || method === 'PUT')) {
    axiosConfig.data = data;
  }
  
  // Make the API request
  try {
    const response = await axios(axiosConfig);
    
    // ClickUp API returns data directly in response.data
    // For successful responses (2xx), return the data
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    // Handle different types of errors
    if (error.response) {
      // The request was made and the server responded with a status code outside 2xx
      const errorData = error.response.data;
      let errorMessage = 'Unknown API error';
      
      // ClickUp typically returns errors in { err: "message" } format
      if (errorData && errorData.err) {
        errorMessage = errorData.err;
      } else if (errorData && typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData && errorData.message) {
        errorMessage = errorData.message;
      } else if (error.response.statusText) {
        errorMessage = `${error.response.status} ${error.response.statusText}`;
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    } else if (error.request) {
      // The request was made but no response was received
      return {
        success: false,
        error: 'No response from ClickUp API. Please check your network connection and API endpoint.',
      };
    } else {
      // Something happened in setting up the request
      return {
        success: false,
        error: error.message || 'Failed to make request to ClickUp API',
      };
    }
  }
}

module.exports = { run };
