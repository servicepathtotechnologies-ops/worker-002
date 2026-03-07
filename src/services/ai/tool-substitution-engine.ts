/**
 * Tool Substitution Engine
 * 
 * Handles replacement of equivalent tools without breaking workflow graph.
 * 
 * Features:
 * - Tool registry mapping equivalent tools
 * - Config migration between tools
 * - Credential validation
 * - Data flow preservation
 * - Pipeline update after replacement
 */

import { WorkflowNode, WorkflowEdge, Workflow } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { getSupabaseClient } from '../../core/database/supabase-compat';

/**
 * Tool equivalence mapping
 * Maps tools to their equivalent alternatives
 */
export interface ToolEquivalence {
  /**
   * Primary tool type
   */
  primary: string;
  
  /**
   * Equivalent tool types
   */
  equivalents: string[];
  
  /**
   * Config migration function (optional)
   */
  migrateConfig?: (config: Record<string, any>, fromTool: string, toTool: string) => Record<string, any>;
  
  /**
   * Credential mapping (maps credential keys between tools)
   */
  credentialMapping?: Record<string, string>;
}

/**
 * Tool Registry - Maps equivalent tools
 */
export const TOOL_EQUIVALENCE_REGISTRY: Record<string, ToolEquivalence> = {
  // CRM Tools
  hubspot: {
    primary: 'hubspot',
    equivalents: ['zoho_crm', 'salesforce'],
    migrateConfig: (config, fromTool, toTool) => {
      if (toTool === 'zoho_crm') {
        // Map HubSpot config to Zoho CRM
        return {
          module: config.module || 'Leads', // HubSpot object → Zoho module
          record_id: config.objectId || config.record_id,
          fields: config.properties || config.fields,
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'hubspot_api_key': 'zoho_api_key',
      'hubspot_access_token': 'zoho_access_token',
    },
  },
  zoho_crm: {
    primary: 'zoho_crm',
    equivalents: ['hubspot', 'salesforce'],
    migrateConfig: (config, fromTool, toTool) => {
      if (toTool === 'hubspot') {
        // Map Zoho CRM config to HubSpot
        return {
          objectType: config.module || 'contact', // Zoho module → HubSpot object
          objectId: config.record_id || config.objectId,
          properties: config.fields || config.properties,
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'zoho_api_key': 'hubspot_api_key',
      'zoho_access_token': 'hubspot_access_token',
    },
  },
  
  // Email Tools
  google_gmail: {
    primary: 'google_gmail',
    equivalents: ['outlook', 'email'],
    migrateConfig: (config, fromTool, toTool) => {
      if (toTool === 'outlook') {
        // Map Gmail config to Outlook
        return {
          to: config.to || config.recipient,
          subject: config.subject,
          body: config.body || config.message || config.html,
          cc: config.cc,
          bcc: config.bcc,
          attachments: config.attachments,
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'gmail_oauth_token': 'outlook_access_token',
      'gmail_refresh_token': 'outlook_refresh_token',
    },
  },
  gmail: {
    primary: 'google_gmail',
    equivalents: ['outlook', 'email'],
    migrateConfig: (config, fromTool, toTool) => {
      // Alias for google_gmail - use same migration logic
      if (toTool === 'outlook') {
        return {
          to: config.to || config.recipient,
          subject: config.subject,
          body: config.body || config.message || config.html,
          cc: config.cc,
          bcc: config.bcc,
          attachments: config.attachments,
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'gmail_oauth_token': 'outlook_access_token',
      'gmail_refresh_token': 'outlook_refresh_token',
    },
  },
  outlook: {
    primary: 'outlook',
    equivalents: ['google_gmail', 'email'],
    migrateConfig: (config, fromTool, toTool) => {
      if (toTool === 'google_gmail') {
        // Map Outlook config to Gmail
        return {
          to: config.to || config.recipient,
          subject: config.subject,
          body: config.body || config.message || config.html,
          cc: config.cc,
          bcc: config.bcc,
          attachments: config.attachments,
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'outlook_access_token': 'gmail_oauth_token',
      'outlook_refresh_token': 'gmail_refresh_token',
    },
  },
  
  // Messaging Tools
  slack_message: {
    primary: 'slack_message',
    equivalents: ['telegram', 'discord', 'teams'],
    migrateConfig: (config, fromTool, toTool) => {
      if (toTool === 'telegram') {
        // Map Slack config to Telegram
        return {
          chat_id: config.channel || config.chat_id, // Slack channel → Telegram chat_id
          text: config.text || config.message,
          parse_mode: 'HTML', // Default for Telegram
          ...config,
        };
      } else if (toTool === 'discord') {
        // Map Slack config to Discord
        return {
          channel_id: config.channel || config.channel_id,
          content: config.text || config.message,
          embeds: config.blocks || [], // Slack blocks → Discord embeds
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'slack_bot_token': 'telegram_bot_token',
      'slack_webhook_url': 'telegram_webhook_url',
    },
  },
  slack: {
    primary: 'slack_message',
    equivalents: ['telegram', 'discord', 'teams'],
    migrateConfig: (config, fromTool, toTool) => {
      // Alias for slack_message - use same migration logic
      if (toTool === 'telegram') {
        return {
          chat_id: config.channel || config.chat_id,
          text: config.text || config.message,
          parse_mode: 'HTML',
          ...config,
        };
      } else if (toTool === 'discord') {
        return {
          channel_id: config.channel || config.channel_id,
          content: config.text || config.message,
          embeds: config.blocks || [],
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'slack_bot_token': 'telegram_bot_token',
      'slack_webhook_url': 'telegram_webhook_url',
    },
  },
  telegram: {
    primary: 'telegram',
    equivalents: ['slack_message', 'discord', 'teams'],
    migrateConfig: (config, fromTool, toTool) => {
      if (toTool === 'slack_message') {
        // Map Telegram config to Slack
        return {
          channel: config.chat_id || config.channel,
          text: config.text || config.message,
          blocks: [], // Telegram doesn't have blocks
          ...config,
        };
      } else if (toTool === 'discord') {
        // Map Telegram config to Discord
        return {
          channel_id: config.chat_id || config.channel_id,
          content: config.text || config.message,
          embeds: [],
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'telegram_bot_token': 'slack_bot_token',
      'telegram_webhook_url': 'slack_webhook_url',
    },
  },
  
  // Database Tools
  database_read: {
    primary: 'database_read',
    equivalents: ['database_write', 'airtable'],
    migrateConfig: (config, fromTool, toTool) => {
      if (toTool === 'airtable') {
        // Map database config to Airtable
        return {
          base_id: config.database || config.base_id,
          table_name: config.table || config.table_name,
          fields: config.columns || config.fields,
          filter_by_formula: config.where || config.filter_by_formula,
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'database_connection_string': 'airtable_api_key',
    },
  },
  
  // Storage Tools
  google_sheets: {
    primary: 'google_sheets',
    equivalents: ['airtable', 'notion'],
    migrateConfig: (config, fromTool, toTool) => {
      if (toTool === 'airtable') {
        // Map Google Sheets config to Airtable
        return {
          base_id: config.spreadsheet_id || config.base_id,
          table_name: config.sheet_name || config.table_name,
          fields: config.columns || config.fields,
          ...config,
        };
      } else if (toTool === 'notion') {
        // Map Google Sheets config to Notion
        return {
          database_id: config.spreadsheet_id || config.database_id,
          properties: config.columns || config.properties,
          ...config,
        };
      }
      return config;
    },
    credentialMapping: {
      'google_sheets_oauth_airtable': 'airtable_api_key',
      'google_sheets_oauth_notion': 'notion_api_key',
    },
  },
};

/**
 * Get equivalent tools for a given tool
 */
export function getEquivalentTools(toolType: string): string[] {
  const normalized = unifiedNormalizeNodeTypeString(toolType);
  const equivalence = TOOL_EQUIVALENCE_REGISTRY[normalized];
  
  if (equivalence) {
    return [equivalence.primary, ...equivalence.equivalents];
  }
  
  // Check if tool is an equivalent of another tool
  for (const [key, value] of Object.entries(TOOL_EQUIVALENCE_REGISTRY)) {
    if (value.equivalents.includes(normalized)) {
      return [value.primary, ...value.equivalents];
    }
  }
  
  return [];
}

/**
 * Check if two tools are equivalent
 */
export function areToolsEquivalent(tool1: string, tool2: string): boolean {
  const equivalents1 = getEquivalentTools(tool1);
  const equivalents2 = getEquivalentTools(tool2);
  
  return equivalents1.some(t => equivalents2.includes(t));
}

/**
 * Tool substitution result
 */
export interface ToolSubstitutionResult {
  /**
   * Success status
   */
  success: boolean;
  
  /**
   * Updated workflow
   */
  workflow: Workflow;
  
  /**
   * Substituted nodes
   */
  substitutedNodes: Array<{
    nodeId: string;
    fromTool: string;
    toTool: string;
    configMigrated: boolean;
  }>;
  
  /**
   * Credential validation results
   */
  credentialValidation: Array<{
    nodeId: string;
    tool: string;
    hasCredentials: boolean;
    missingCredentials: string[];
  }>;
  
  /**
   * Errors
   */
  errors: string[];
  
  /**
   * Warnings
   */
  warnings: string[];
}

/**
 * Tool Substitution Engine
 */
export class ToolSubstitutionEngine {
  /**
   * Substitute tool in workflow
   */
  async substituteTool(
    workflow: Workflow,
    nodeId: string,
    newTool: string,
    userId?: string
  ): Promise<ToolSubstitutionResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const substitutedNodes: ToolSubstitutionResult['substitutedNodes'] = [];
    const credentialValidation: ToolSubstitutionResult['credentialValidation'] = [];

    // Find node
    const node = workflow.nodes?.find(n => n.id === nodeId);
    if (!node) {
      return {
        success: false,
        workflow,
        substitutedNodes: [],
        credentialValidation: [],
        errors: [`Node ${nodeId} not found in workflow`],
        warnings: [],
      };
    }

    const currentTool = unifiedNormalizeNodeType(node);
    
    // Validate substitution
    if (!areToolsEquivalent(currentTool, newTool)) {
      return {
        success: false,
        workflow,
        substitutedNodes: [],
        credentialValidation: [],
        errors: [`Tool ${currentTool} cannot be substituted with ${newTool}. They are not equivalent.`],
        warnings: [],
      };
    }

    // Check if new tool exists in node library
    const newToolSchema = nodeLibrary.getSchema(newTool);
    if (!newToolSchema) {
      return {
        success: false,
        workflow,
        substitutedNodes: [],
        credentialValidation: [],
        errors: [`Tool ${newTool} not found in node library`],
        warnings: [],
      };
    }

    // Get equivalence mapping
    const equivalence = TOOL_EQUIVALENCE_REGISTRY[currentTool] || 
                       Object.values(TOOL_EQUIVALENCE_REGISTRY).find(e => e.equivalents.includes(currentTool));

    // Migrate config
    let migratedConfig = node.data?.config || {};
    if (equivalence?.migrateConfig) {
      try {
        migratedConfig = equivalence.migrateConfig(migratedConfig, currentTool, newTool);
        console.log(`[ToolSubstitution] Migrated config from ${currentTool} to ${newTool}`);
      } catch (error) {
        warnings.push(`Config migration failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Update node
    const updatedNodes = workflow.nodes?.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            type: newTool,
            label: newToolSchema.label || newTool,
            category: newToolSchema.category || n.data?.category,
            config: migratedConfig,
          },
        };
      }
      return n;
    }) || [];

    // Validate credentials
    const credentialCheck = await this.validateCredentials(newTool, userId);
    credentialValidation.push({
      nodeId,
      tool: newTool,
      hasCredentials: credentialCheck.hasCredentials,
      missingCredentials: credentialCheck.missingCredentials,
    });

    if (!credentialCheck.hasCredentials) {
      warnings.push(`Credentials for ${newTool} not found. Please configure credentials before execution.`);
    }

    // Preserve data flow (edges remain unchanged)
    const updatedWorkflow: Workflow = {
      nodes: updatedNodes,
      edges: workflow.edges || [], // Preserve all edges
    };

    substitutedNodes.push({
      nodeId,
      fromTool: currentTool,
      toTool: newTool,
      configMigrated: !!equivalence?.migrateConfig,
    });

    console.log(`[ToolSubstitution] ✅ Substituted ${currentTool} → ${newTool} for node ${nodeId}`);

    return {
      success: true,
      workflow: updatedWorkflow,
      substitutedNodes,
      credentialValidation,
      errors,
      warnings,
    };
  }

  /**
   * Substitute multiple tools in workflow
   */
  async substituteTools(
    workflow: Workflow,
    substitutions: Array<{ nodeId: string; newTool: string }>,
    userId?: string
  ): Promise<ToolSubstitutionResult> {
    let currentWorkflow = workflow;
    const allSubstitutedNodes: ToolSubstitutionResult['substitutedNodes'] = [];
    const allCredentialValidation: ToolSubstitutionResult['credentialValidation'] = [];
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    // Apply substitutions sequentially
    for (const substitution of substitutions) {
      const result = await this.substituteTool(
        currentWorkflow,
        substitution.nodeId,
        substitution.newTool,
        userId
      );

      if (!result.success) {
        allErrors.push(...result.errors);
        // Continue with other substitutions even if one fails
        continue;
      }

      currentWorkflow = result.workflow;
      allSubstitutedNodes.push(...result.substitutedNodes);
      allCredentialValidation.push(...result.credentialValidation);
      allWarnings.push(...result.warnings);
    }

    return {
      success: allErrors.length === 0,
      workflow: currentWorkflow,
      substitutedNodes: allSubstitutedNodes,
      credentialValidation: allCredentialValidation,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  /**
   * Validate credentials for a tool
   */
  private async validateCredentials(
    toolType: string,
    userId?: string
  ): Promise<{ hasCredentials: boolean; missingCredentials: string[] }> {
    if (!userId) {
      return {
        hasCredentials: false,
        missingCredentials: ['User ID required'],
      };
    }

    const supabase = getSupabaseClient();
    
    try {
      // Get tool schema to determine required credentials
      const schema = nodeLibrary.getSchema(toolType);
      if (!schema) {
        return {
          hasCredentials: false,
          missingCredentials: ['Tool schema not found'],
        };
      }

      // Check for credentials in vault (simplified - actual implementation depends on credential storage)
      // This is a placeholder - actual credential checking should use your credential vault system
      const { data: credentials, error } = await supabase
        .from('credentials')
        .select('*')
        .eq('user_id', userId)
        .eq('service', toolType)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error(`[ToolSubstitution] Error checking credentials:`, error);
        return {
          hasCredentials: false,
          missingCredentials: ['Error checking credentials'],
        };
      }

      return {
        hasCredentials: !!credentials,
        missingCredentials: credentials ? [] : [`Credentials for ${toolType} not found`],
      };
    } catch (error) {
      console.error(`[ToolSubstitution] Credential validation failed:`, error);
      return {
        hasCredentials: false,
        missingCredentials: ['Credential validation failed'],
      };
    }
  }

  /**
   * Get available substitutions for a node
   */
  getAvailableSubstitutions(nodeId: string, workflow: Workflow): string[] {
    const node = workflow.nodes?.find(n => n.id === nodeId);
    if (!node) {
      return [];
    }

    const currentTool = unifiedNormalizeNodeType(node);
    return getEquivalentTools(currentTool);
  }

  /**
   * Validate workflow after substitution
   */
  validateWorkflowAfterSubstitution(workflow: Workflow): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check all nodes exist in library
    workflow.nodes?.forEach(node => {
      const nodeType = unifiedNormalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);
      if (!schema) {
        errors.push(`Node ${node.id} has invalid type: ${nodeType}`);
      }
    });

    // Check edges are valid
    workflow.edges?.forEach(edge => {
      const sourceNode = workflow.nodes?.find(n => n.id === edge.source);
      const targetNode = workflow.nodes?.find(n => n.id === edge.target);
      
      if (!sourceNode) {
        errors.push(`Edge ${edge.id} references missing source node: ${edge.source}`);
      }
      if (!targetNode) {
        errors.push(`Edge ${edge.id} references missing target node: ${edge.target}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export const toolSubstitutionEngine = new ToolSubstitutionEngine();
