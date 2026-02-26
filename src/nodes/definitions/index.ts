/**
 * Node Definitions Index
 * 
 * Registers all node definitions with the global registry.
 * Backend is the source of truth for all node schemas.
 */

import { nodeDefinitionRegistry } from '../../core/types/node-definition';
import { ifElseNodeDefinition } from './if-else-node';
import { manualTriggerNodeDefinition } from './manual-trigger-node';
import { webhookTriggerNodeDefinition } from './webhook-trigger-node';
import { scheduleTriggerNodeDefinition } from './schedule-trigger-node';
import { intervalTriggerNodeDefinition } from './interval-trigger-node';
import { javascriptNodeDefinition } from './javascript-node';
import { logOutputNodeDefinition } from './log-output-node';
import { httpRequestNodeDefinition } from './http-request-node';
import { airtableNodeDefinition } from './airtable-node';
import { pipedriveNodeDefinition } from './pipedrive-node';
import { notionNodeDefinition } from './notion-node';
import { twitterNodeDefinition } from './twitter-node';
import { instagramNodeDefinition } from './instagram-node';
import { whatsappNodeDefinition } from './whatsapp-node';
import { googleCalendarNodeDefinition } from './google-calendar-node';
import { googleVeoNodeDefinition } from './google-veo-node';
import { lightricksNodeDefinition } from './lightricks-node';
import { sqlServerNodeDefinition } from './sql-server-node';
import { mongoDBNodeDefinition } from './mongodb-node';
import { mysqlNodeDefinition } from './mysql-node';
import { postgresNodeDefinition } from './postgres-node';
import { redisNodeDefinition } from './redis-node';
import { snowflakeNodeDefinition } from './snowflake-node';
import { sqliteNodeDefinition } from './sqlite-node';
import { supabaseNodeDefinition } from './supabase-node';
import { timescaleDBNodeDefinition } from './timescaledb-node';
import { registerNodeDefinitionsFromNodeLibrary } from './from-node-library';

// Register all node definitions
export function registerAllNodeDefinitions() {
  // Trigger nodes
  nodeDefinitionRegistry.register(manualTriggerNodeDefinition);
  nodeDefinitionRegistry.register(webhookTriggerNodeDefinition);
  nodeDefinitionRegistry.register(scheduleTriggerNodeDefinition);
  nodeDefinitionRegistry.register(intervalTriggerNodeDefinition);

  // Logic nodes
  nodeDefinitionRegistry.register(ifElseNodeDefinition);
  nodeDefinitionRegistry.register(javascriptNodeDefinition);

  // Utility nodes
  nodeDefinitionRegistry.register(logOutputNodeDefinition);

  // HTTP & API nodes
  nodeDefinitionRegistry.register(httpRequestNodeDefinition);

  // Database nodes
  nodeDefinitionRegistry.register(airtableNodeDefinition);
  nodeDefinitionRegistry.register(notionNodeDefinition);
  nodeDefinitionRegistry.register(sqlServerNodeDefinition);
  nodeDefinitionRegistry.register(mongoDBNodeDefinition);
  nodeDefinitionRegistry.register(mysqlNodeDefinition);
  nodeDefinitionRegistry.register(postgresNodeDefinition);
  nodeDefinitionRegistry.register(redisNodeDefinition);
  nodeDefinitionRegistry.register(snowflakeNodeDefinition);
  nodeDefinitionRegistry.register(sqliteNodeDefinition);
  nodeDefinitionRegistry.register(supabaseNodeDefinition);
  nodeDefinitionRegistry.register(timescaleDBNodeDefinition);

  // CRM nodes
  nodeDefinitionRegistry.register(pipedriveNodeDefinition);

  // Social nodes
  nodeDefinitionRegistry.register(twitterNodeDefinition);
  nodeDefinitionRegistry.register(instagramNodeDefinition);
  nodeDefinitionRegistry.register(whatsappNodeDefinition);

  // Productivity nodes
  nodeDefinitionRegistry.register(googleCalendarNodeDefinition);

  // AI/ML nodes
  nodeDefinitionRegistry.register(googleVeoNodeDefinition);
  nodeDefinitionRegistry.register(lightricksNodeDefinition);

  // TODO: Continue migrating remaining nodes
  // - Database nodes
  // - File operations
  // - Email nodes (Gmail, SMTP)
  // - Data transformation nodes
  // - All other nodes from nodeTypes.ts

  // ✅ Framework-level guarantee: register all remaining schemas from NodeLibrary
  // so NodeDefinitionRegistry is complete (single source of truth for schema/defaults/providers).
  registerNodeDefinitionsFromNodeLibrary();
}

// Auto-register on import
registerAllNodeDefinitions();
