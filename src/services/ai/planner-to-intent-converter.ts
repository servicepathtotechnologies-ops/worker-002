/**
 * Planner to Intent Converter
 * 
 * Converts WorkflowSpec (from planner) to StructuredIntent.
 * 
 * Mapping:
 * - planner.data_sources → intent.dataSources
 * - planner.actions → intent.actions
 * - planner.transformations → intent.transformations
 * 
 * Rules:
 * - Do NOT merge data_sources into actions
 * - Do NOT merge transformations into actions
 * - Preserve separate fields as planner intended
 */

import { WorkflowSpec } from '../../planner/types';
import { StructuredIntent } from './intent-structurer';

/**
 * Convert WorkflowSpec to StructuredIntent
 * 
 * @param spec - WorkflowSpec from planner
 * @returns StructuredIntent with preserved fields
 */
export function convertPlannerSpecToIntent(spec: WorkflowSpec): StructuredIntent {
  console.log('[PlannerToIntentConverter] Converting WorkflowSpec to StructuredIntent...');
  console.log(`[PlannerToIntentConverter]   data_sources: ${spec.data_sources.length}`);
  console.log(`[PlannerToIntentConverter]   actions: ${spec.actions.length}`);
  console.log(`[PlannerToIntentConverter]   transformations: ${spec.transformations.length}`);

  // Map trigger
  const trigger = mapTriggerType(spec.trigger);

  // Map data_sources → dataSources (preserve separately)
  const dataSources = spec.data_sources.map((ds, index) => {
    // Parse data source string (e.g., "google_sheets" or "google_sheets.read")
    const parts = ds.split('.');
    const type = parts[0];
    const operation = parts[1] || 'read'; // Default to 'read' for data sources

    return {
      type,
      operation,
      config: {},
    };
  });

  // Map actions → actions (preserve separately)
  const actions = spec.actions.map((action, index) => {
    // Parse action string (e.g., "hubspot.create_contact" or "google_gmail.send")
    const parts = action.split('.');
    const type = parts[0];
    const operation = parts[1] || 'create'; // Default to 'create' for actions

    return {
      type,
      operation,
      config: {},
    };
  });

  // Map transformations → transformations (preserve separately)
  const transformations = spec.transformations.map((tf, index) => {
    // Transformations are usually just strings like "loop", "filter", "merge"
    // Map to appropriate node types
    const transformationMap: Record<string, { type: string; operation: string }> = {
      'loop': { type: 'loop', operation: 'iterate' },
      'filter': { type: 'filter', operation: 'filter' },
      'merge': { type: 'merge', operation: 'merge' },
      'if': { type: 'if_else', operation: 'condition' },
      'switch': { type: 'switch', operation: 'switch' },
    };

    const normalized = tf.toLowerCase();
    const mapped = transformationMap[normalized] || { type: tf, operation: 'transform' };

    return {
      type: mapped.type,
      operation: mapped.operation,
      config: {},
    };
  });

  // Extract credentials from all sources
  const credentials = new Set<string>();
  dataSources.forEach(ds => {
    if (ds.type && !ds.type.includes('.')) {
      credentials.add(ds.type);
    }
  });
  actions.forEach(action => {
    if (action.type && !action.type.includes('.')) {
      credentials.add(action.type);
    }
  });

  const intent: StructuredIntent = {
    trigger,
    actions,
    dataSources: dataSources.length > 0 ? dataSources : undefined,
    transformations: transformations.length > 0 ? transformations : undefined,
    requires_credentials: Array.from(credentials),
  };

  console.log(`[PlannerToIntentConverter] ✅ Converted:`);
  console.log(`[PlannerToIntentConverter]   - dataSources: ${intent.dataSources?.length || 0}`);
  console.log(`[PlannerToIntentConverter]   - actions: ${intent.actions.length}`);
  console.log(`[PlannerToIntentConverter]   - transformations: ${intent.transformations?.length || 0}`);

  return intent;
}

/**
 * Map planner trigger type to StructuredIntent trigger
 */
function mapTriggerType(plannerTrigger: string): string {
  const triggerMap: Record<string, string> = {
    'manual': 'manual_trigger',
    'schedule': 'schedule',
    'webhook': 'webhook',
    'event': 'manual_trigger', // Events default to manual_trigger
  };

  return triggerMap[plannerTrigger.toLowerCase()] || 'manual_trigger';
}
