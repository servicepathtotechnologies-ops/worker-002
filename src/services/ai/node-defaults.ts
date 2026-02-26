// Node Defaults System
// Provides default values for all required fields across all node types
// Ensures workflows are always valid and executable

import { nodeLibrary } from '../nodes/node-library';

export interface NodeDefaults {
  [nodeType: string]: Record<string, any>;
}

/**
 * UNIVERSAL: Get default values for required fields of any node type
 * Uses node library schema as source of truth
 */
export class NodeDefaultsSystem {
  /**
   * Get default value for a specific field in a node type
   */
  getDefaultValue(nodeType: string, fieldName: string, context?: {
    requirements?: any;
    previousNode?: any;
    workflowGoal?: string;
  }): any {
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema) {
      return this.getFallbackDefault(fieldName);
    }

    // Check if field has default in schema
    const fieldInfo = schema.configSchema?.optional?.[fieldName];
    if (fieldInfo?.default !== undefined) {
      return fieldInfo.default;
    }

    // Use node-specific defaults
    return this.getNodeSpecificDefault(nodeType, fieldName, context);
  }

  /**
   * Get all required field defaults for a node type
   */
  getRequiredFieldDefaults(nodeType: string, context?: {
    requirements?: any;
    previousNode?: any;
    workflowGoal?: string;
  }): Record<string, any> {
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema) {
      return {};
    }

    const defaults: Record<string, any> = {};
    const requiredFields = schema.configSchema?.required || [];

    for (const fieldName of requiredFields) {
      defaults[fieldName] = this.getDefaultValue(nodeType, fieldName, context);
    }

    return defaults;
  }

  /**
   * Get node-specific defaults based on type
   */
  private getNodeSpecificDefault(
    nodeType: string,
    fieldName: string,
    context?: {
      requirements?: any;
      previousNode?: any;
      workflowGoal?: string;
    }
  ): any {
    const fieldNameLower = fieldName.toLowerCase();
    const nodeTypeLower = nodeType.toLowerCase();

    // AI Agent defaults
    if (nodeTypeLower === 'ai_agent') {
      if (fieldNameLower === 'userinput' || fieldNameLower === 'user_input') {
        if (context?.workflowGoal) {
          return `Process the following request: ${context.workflowGoal}. User input: {{inputData}}`;
        }
        if (context?.previousNode?.type === 'chat_trigger') {
          return '{{message}}';
        }
        if (context?.previousNode?.type === 'manual_trigger') {
          return '{{inputData}}';
        }
        return 'Process the provided data and generate appropriate content based on the workflow requirements.';
      }
      if (fieldNameLower === 'chat_model' || fieldNameLower === 'chatmodel') {
        // Will be connected via edge, but provide fallback
        return 'gemini-pro';
      }
      if (fieldNameLower === 'memory') {
        return 'window_buffer';
      }
    }

    // Manual Trigger defaults
    if (nodeTypeLower === 'manual_trigger') {
      if (fieldNameLower === 'inputdata' || fieldNameLower === 'input_data') {
        return JSON.stringify({ triggered: true });
      }
    }

    // Schedule Trigger defaults
    if (nodeTypeLower === 'schedule' || nodeTypeLower === 'schedule_trigger') {
      if (fieldNameLower === 'cron' || fieldNameLower === 'cronexpression' || fieldNameLower === 'cron_expression') {
        return '0 9 * * *'; // Daily at 9 AM
      }
      if (fieldNameLower === 'time' || fieldNameLower === 'timezone') {
        return 'UTC';
      }
    }

    // Interval Trigger defaults
    if (nodeTypeLower === 'interval') {
      if (fieldNameLower === 'interval') {
        return '10m';
      }
      if (fieldNameLower === 'unit') {
        return 'minutes';
      }
    }

    // Webhook defaults
    if (nodeTypeLower === 'webhook') {
      if (fieldNameLower === 'path') {
        return '/webhook';
      }
      if (fieldNameLower === 'method') {
        return 'POST';
      }
    }

    // Google Sheets defaults
    if (nodeTypeLower === 'google_sheets') {
      if (fieldNameLower === 'spreadsheetid' || fieldNameLower === 'spreadsheet_id') {
        // Will be asked from user, but provide placeholder
        return '';
      }
      if (fieldNameLower === 'operation') {
        return 'read';
      }
      if (fieldNameLower === 'sheetname' || fieldNameLower === 'sheet_name') {
        return 'Sheet1';
      }
      if (fieldNameLower === 'range') {
        return 'A1:Z1000';
      }
    }

    // HTTP Request defaults
    if (nodeTypeLower === 'http_request' || nodeTypeLower === 'http_post') {
      if (fieldNameLower === 'url') {
        return 'https://api.example.com/endpoint';
      }
      if (fieldNameLower === 'method') {
        return nodeTypeLower === 'http_post' ? 'POST' : 'GET';
      }
    }

    // Slack defaults
    if (nodeTypeLower === 'slack_message' || nodeTypeLower === 'slack') {
      if (fieldNameLower === 'channel' || fieldNameLower === 'channelid' || fieldNameLower === 'channel_id') {
        return '#general';
      }
      if (fieldNameLower === 'text' || fieldNameLower === 'message') {
        return 'Workflow executed successfully';
      }
    }

    // Email defaults
    if (nodeTypeLower === 'email') {
      if (fieldNameLower === 'to') {
        return 'user@example.com';
      }
      if (fieldNameLower === 'subject') {
        return 'Workflow Notification';
      }
      if (fieldNameLower === 'text' || fieldNameLower === 'body') {
        return 'The workflow has been executed.';
      }
    }

    // If/Else defaults
    if (nodeTypeLower === 'if_else') {
      if (fieldNameLower === 'condition' || fieldNameLower === 'conditions') {
        return '{{$json}}'; // Will be replaced with actual condition
      }
    }

    // JavaScript defaults
    if (nodeTypeLower === 'javascript' || nodeTypeLower === 'code') {
      if (fieldNameLower === 'code') {
        return `// Process input data
return {
  ...input,
  processed: true
};`;
      }
    }

    // Log Output defaults
    if (nodeTypeLower === 'log_output' || nodeTypeLower === 'log') {
      if (fieldNameLower === 'message') {
        return 'Workflow step executed';
      }
      if (fieldNameLower === 'level') {
        return 'info';
      }
    }

    return this.getFallbackDefault(fieldName);
  }

  /**
   * Get fallback default based on field name patterns
   */
  private getFallbackDefault(fieldName: string): any {
    const fieldNameLower = fieldName.toLowerCase();

    if (fieldNameLower.includes('url') || fieldNameLower.includes('endpoint')) {
      return 'https://example.com';
    }
    if (fieldNameLower.includes('id') || fieldNameLower.includes('identifier')) {
      return '';
    }
    if (fieldNameLower.includes('name') || fieldNameLower.includes('label')) {
      return 'Default';
    }
    if (fieldNameLower.includes('message') || fieldNameLower.includes('text') || fieldNameLower.includes('content')) {
      return 'Default message';
    }
    if (fieldNameLower.includes('email')) {
      return 'user@example.com';
    }
    if (fieldNameLower.includes('number') || fieldNameLower.includes('count') || fieldNameLower.includes('limit')) {
      return 10;
    }
    if (fieldNameLower.includes('boolean') || fieldNameLower.includes('enabled') || fieldNameLower.includes('active')) {
      return true;
    }

    return '';
  }
}

export const nodeDefaults = new NodeDefaultsSystem();
