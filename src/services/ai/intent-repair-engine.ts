/**
 * Intent Repair Engine
 * 
 * ✅ PHASE 2: Repairs common SimpleIntent issues
 * 
 * This engine:
 * - Fixes missing entities
 * - Normalizes entity names
 * - Resolves ambiguities
 * - Improves intent completeness
 * 
 * Architecture Rule:
 * - Repairs SimpleIntent BEFORE passing to planner
 * - Uses deterministic rules (not LLM)
 * - Improves intent quality automatically
 */

import { SimpleIntent } from './simple-intent';
import { IntentValidationResult } from './intent-validator';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

export interface IntentRepairResult {
  repairedIntent: SimpleIntent;
  repairs: string[]; // List of repairs made
  warnings: string[];
}

export class IntentRepairEngine {
  private static instance: IntentRepairEngine;
  
  private constructor() {}
  
  static getInstance(): IntentRepairEngine {
    if (!IntentRepairEngine.instance) {
      IntentRepairEngine.instance = new IntentRepairEngine();
    }
    return IntentRepairEngine.instance;
  }
  
  /**
   * Repair SimpleIntent based on validation errors
   * 
   * @param intent - SimpleIntent to repair
   * @param validation - Validation result with errors and suggestions
   * @param originalPrompt - Original user prompt (for context)
   * @returns Repaired intent with list of repairs made
   */
  repair(
    intent: SimpleIntent,
    validation: IntentValidationResult,
    originalPrompt?: string
  ): IntentRepairResult {
    const repairs: string[] = [];
    const warnings: string[] = [];
    let repairedIntent: SimpleIntent = { ...intent };
    
    // ✅ REPAIR 1: Add missing verbs (if none)
    if (!repairedIntent.verbs || repairedIntent.verbs.length === 0) {
      if (originalPrompt) {
        const inferredVerbs = this.inferVerbsFromPrompt(originalPrompt);
        if (inferredVerbs.length > 0) {
          repairedIntent.verbs = inferredVerbs;
          repairs.push(`Added missing verbs: ${inferredVerbs.join(', ')}`);
        } else {
          // Default verb based on context
          if (repairedIntent.destinations && repairedIntent.destinations.length > 0) {
            repairedIntent.verbs = ['send'];
            repairs.push('Added default verb: "send" (inferred from destinations)');
          } else if (repairedIntent.sources && repairedIntent.sources.length > 0) {
            repairedIntent.verbs = ['read'];
            repairs.push('Added default verb: "read" (inferred from sources)');
          }
        }
      }
    }
    
    // ✅ REPAIR 2: Normalize entity names
    if (repairedIntent.sources) {
      const normalized = this.normalizeEntityNames(repairedIntent.sources);
      if (JSON.stringify(normalized) !== JSON.stringify(repairedIntent.sources)) {
        repairs.push(`Normalized source names: ${repairedIntent.sources.join(', ')} → ${normalized.join(', ')}`);
        repairedIntent.sources = normalized;
      }
    }
    
    if (repairedIntent.destinations) {
      const normalized = this.normalizeEntityNames(repairedIntent.destinations);
      if (JSON.stringify(normalized) !== JSON.stringify(repairedIntent.destinations)) {
        repairs.push(`Normalized destination names: ${repairedIntent.destinations.join(', ')} → ${normalized.join(', ')}`);
        repairedIntent.destinations = normalized;
      }
    }
    
    // ✅ REPAIR 3: Add missing sources/destinations (if inferred from context)
    if (originalPrompt) {
      const hasSource = repairedIntent.sources && repairedIntent.sources.length > 0;
      const hasDestination = repairedIntent.destinations && repairedIntent.destinations.length > 0;
      
      if (!hasSource && !hasDestination) {
        // Try to infer from prompt
        const inferredSources = this.inferSourcesFromPrompt(originalPrompt);
        const inferredDestinations = this.inferDestinationsFromPrompt(originalPrompt);
        
        if (inferredSources.length > 0) {
          repairedIntent.sources = inferredSources;
          repairs.push(`Added inferred sources: ${inferredSources.join(', ')}`);
        }
        
        if (inferredDestinations.length > 0) {
          repairedIntent.destinations = inferredDestinations;
          repairs.push(`Added inferred destinations: ${inferredDestinations.join(', ')}`);
        }
      }
    }
    
    // ✅ REPAIR 4: Normalize trigger
      if (repairedIntent.trigger) {
      const normalized = this.normalizeTrigger(repairedIntent.trigger);
      if (normalized && JSON.stringify(normalized) !== JSON.stringify(repairedIntent.trigger)) {
        repairs.push(`Normalized trigger: ${repairedIntent.trigger.type} → ${normalized.type}`);
        repairedIntent.trigger = normalized;
      }
    } else {
      // Add default trigger if missing
      repairedIntent.trigger = { type: 'manual' };
      repairs.push('Added default trigger: "manual"');
    }
    
    // ✅ REPAIR 5: Remove duplicates
    if (repairedIntent.verbs) {
      const unique = Array.from(new Set(repairedIntent.verbs));
      if (unique.length !== repairedIntent.verbs.length) {
        repairs.push(`Removed duplicate verbs: ${repairedIntent.verbs.length} → ${unique.length}`);
        repairedIntent.verbs = unique;
      }
    }
    
    if (repairedIntent.sources) {
      const unique = Array.from(new Set(repairedIntent.sources));
      if (unique.length !== repairedIntent.sources.length) {
        repairs.push(`Removed duplicate sources: ${repairedIntent.sources.length} → ${unique.length}`);
        repairedIntent.sources = unique;
      }
    }
    
    if (repairedIntent.destinations) {
      const unique = Array.from(new Set(repairedIntent.destinations));
      if (unique.length !== repairedIntent.destinations.length) {
        repairs.push(`Removed duplicate destinations: ${repairedIntent.destinations.length} → ${unique.length}`);
        repairedIntent.destinations = unique;
      }
    }
    
    // ✅ REPAIR 6: Validate and fix conditions
    if (repairedIntent.conditions) {
      const validConditions = repairedIntent.conditions.filter(c => 
        c.description && c.description.trim().length > 0
      );
      
      if (validConditions.length !== repairedIntent.conditions.length) {
        warnings.push(`Removed ${repairedIntent.conditions.length - validConditions.length} invalid condition(s)`);
        repairedIntent.conditions = validConditions.length > 0 ? validConditions : undefined;
      }
    }
    
    return {
      repairedIntent,
      repairs,
      warnings,
    };
  }
  
  /**
   * Infer verbs from prompt
   */
  private inferVerbsFromPrompt(prompt: string): string[] {
    const promptLower = prompt.toLowerCase();
    const verbs: string[] = [];
    
    if (/\b(send|sending|sent)\b/.test(promptLower)) verbs.push('send');
    if (/\b(read|reading|reads|get|getting|gets|fetch)\b/.test(promptLower)) verbs.push('read');
    if (/\b(create|creating|creates|add|adding)\b/.test(promptLower)) verbs.push('create');
    if (/\b(update|updating|updates|modify)\b/.test(promptLower)) verbs.push('update');
    if (/\b(delete|deleting|deletes|remove)\b/.test(promptLower)) verbs.push('delete');
    if (/\b(notify|notifying|notifies|alert)\b/.test(promptLower)) verbs.push('notify');
    
    return verbs;
  }
  
  /**
   * Infer sources from prompt using registry (UNIVERSAL)
   */
  private inferSourcesFromPrompt(prompt: string): string[] {
    const sources: string[] = [];
    const promptLower = prompt.toLowerCase();
    
    // ✅ UNIVERSAL: Get all data source nodes from registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check if node is a data source
      if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
        const label = nodeDef.label || nodeType;
        const labelLower = label.toLowerCase();
        const typeLower = nodeType.toLowerCase();
        const keywords = nodeDef.tags || [];
        
        // Check if label, type, or keywords match prompt
        if (promptLower.includes(labelLower) || promptLower.includes(typeLower)) {
          sources.push(label);
        } else {
          // Check keywords
          for (const keyword of keywords) {
            if (promptLower.includes(keyword.toLowerCase())) {
              sources.push(label);
              break;
            }
          }
        }
      }
    }
    
    return sources;
  }
  
  /**
   * Infer destinations from prompt using registry (UNIVERSAL)
   */
  private inferDestinationsFromPrompt(prompt: string): string[] {
    const destinations: string[] = [];
    const promptLower = prompt.toLowerCase();
    
    // ✅ UNIVERSAL: Get all output nodes from registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check if node is an output
      if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
        const label = nodeDef.label || nodeType;
        const labelLower = label.toLowerCase();
        const typeLower = nodeType.toLowerCase();
        const keywords = nodeDef.tags || [];
        
        // Check if label, type, or keywords match prompt
        if (promptLower.includes(labelLower) || promptLower.includes(typeLower)) {
          destinations.push(label);
        } else {
          // Check keywords
          for (const keyword of keywords) {
            if (promptLower.includes(keyword.toLowerCase())) {
              destinations.push(label);
              break;
            }
          }
        }
      }
    }
    
    return destinations;
  }
  
  /**
   * Normalize entity names using registry (UNIVERSAL)
   */
  private normalizeEntityNames(entities: string[]): string[] {
    const normalized: string[] = [];
    
    // ✅ UNIVERSAL: Get all node types from registry for normalization
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    const nodeLabels = new Map<string, string>(); // entity name → canonical label
    
    // Build map of entity variations to canonical labels
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      const label = nodeDef.label || nodeType;
      const labelLower = label.toLowerCase();
      const typeLower = nodeType.toLowerCase();
      const keywords = nodeDef.tags || [];
      
      // Map label to itself
      nodeLabels.set(labelLower, label);
      
      // Map type to label
      nodeLabels.set(typeLower, label);
      
      // Map keywords to label
      for (const keyword of keywords) {
        nodeLabels.set(keyword.toLowerCase(), label);
      }
    }
    
    // Normalize each entity
    for (const entity of entities) {
      const entityLower = entity.toLowerCase();
      
      // Try exact match first
      if (nodeLabels.has(entityLower)) {
        normalized.push(nodeLabels.get(entityLower)!);
      } else {
        // Try partial match (entity contains node name or vice versa)
        let matched = false;
        for (const [key, canonicalLabel] of nodeLabels.entries()) {
          if (entityLower.includes(key) || key.includes(entityLower)) {
            normalized.push(canonicalLabel);
            matched = true;
            break;
          }
        }
        
        // Keep original if no match found
        if (!matched) {
          normalized.push(entity);
        }
      }
    }
    
    return normalized;
  }
  
  /**
   * Normalize trigger
   */
  private normalizeTrigger(trigger: SimpleIntent['trigger']): SimpleIntent['trigger'] {
    if (!trigger) {
      return { type: 'manual' };
    }
    
    // Normalize trigger type
    const typeLower = trigger.type.toLowerCase();
    if (typeLower === 'scheduled' || typeLower === 'schedule') {
      return { type: 'schedule', description: trigger.description };
    }
    if (typeLower === 'webhooks' || typeLower === 'webhook') {
      return { type: 'webhook', description: trigger.description };
    }
    if (typeLower === 'forms' || typeLower === 'form') {
      return { type: 'form', description: trigger.description };
    }
    if (typeLower === 'chat' || typeLower === 'message' || typeLower === 'messaging') {
      return { type: 'chat', description: trigger.description };
    }
    if (typeLower === 'event' || typeLower === 'events') {
      return { type: 'event', description: trigger.description };
    }
    
    return trigger;
  }
}

// Export singleton instance
export const intentRepairEngine = IntentRepairEngine.getInstance();
