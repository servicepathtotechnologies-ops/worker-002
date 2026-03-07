/**
 * Fallback Intent Generator
 * 
 * ✅ PHASE 2: Rule-based SimpleIntent generation (no LLM required)
 * 
 * This generator:
 * - Uses keyword matching and pattern recognition
 * - Works when LLM is unavailable or fails
 * - Provides deterministic fallback
 * - Returns SimpleIntent (basic entities)
 * 
 * Architecture Rule:
 * - This is a FALLBACK, not primary method
 * - Primary method is LLM extraction (intent-extractor.ts)
 * - This ensures system works even without LLM
 */

import { SimpleIntent, SimpleIntentResult } from './simple-intent';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

export class FallbackIntentGenerator {
  private static instance: FallbackIntentGenerator;
  
  private constructor() {}
  
  static getInstance(): FallbackIntentGenerator {
    if (!FallbackIntentGenerator.instance) {
      FallbackIntentGenerator.instance = new FallbackIntentGenerator();
    }
    return FallbackIntentGenerator.instance;
  }
  
  /**
   * Generate SimpleIntent from prompt using rule-based extraction
   * 
   * @param userPrompt - User's natural language prompt
   * @returns SimpleIntent with extracted entities
   */
  generateFromPrompt(userPrompt: string): SimpleIntentResult {
    const promptLower = userPrompt.toLowerCase();
    
    // Extract verbs (actions)
    const verbs = this.extractVerbs(promptLower);
    
    // Extract sources
    const sources = this.extractSources(promptLower, userPrompt);
    
    // Extract destinations
    const destinations = this.extractDestinations(promptLower, userPrompt);
    
    // Extract trigger
    const trigger = this.extractTrigger(promptLower);
    
    // Extract conditions
    const conditions = this.extractConditions(promptLower, userPrompt);
    
    // Extract transformations
    const transformations = this.extractTransformations(promptLower);
    
    // Extract providers
    const providers = this.extractProviders(promptLower, userPrompt);
    
    const intent: SimpleIntent = {
      verbs,
      sources,
      destinations,
      trigger,
      conditions: conditions.length > 0 ? conditions : undefined,
      transformations: transformations.length > 0 ? transformations : undefined,
      providers: providers.length > 0 ? providers : undefined,
    };
    
    // Calculate confidence (rule-based extraction is less confident than LLM)
    const confidence = this.calculateConfidence(intent);
    
    return {
      intent,
      confidence,
    };
  }
  
  /**
   * Extract verbs (actions) from prompt
   */
  private extractVerbs(prompt: string): string[] {
    const verbPatterns = [
      /\b(send|sending|sent)\b/g,
      /\b(read|reading|reads|get|getting|gets|fetch|fetching|fetches)\b/g,
      /\b(create|creating|creates|add|adding|adds)\b/g,
      /\b(update|updating|updates|modify|modifying|modifies|edit|editing|edits)\b/g,
      /\b(delete|deleting|deletes|remove|removing|removes)\b/g,
      /\b(notify|notifying|notifies|alert|alerting|alerts)\b/g,
      /\b(save|saving|saves|store|storing|stores)\b/g,
      /\b(upload|uploading|uploads)\b/g,
      /\b(download|downloading|downloads)\b/g,
      /\b(post|posting|posts|publish|publishing|publishes)\b/g,
    ];
    
    const verbs = new Set<string>();
    
    for (const pattern of verbPatterns) {
      const matches = prompt.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // Normalize verb (remove -ing, -s, etc.)
          const normalized = match.replace(/ing$|s$|ed$/, '').toLowerCase();
          if (normalized.length > 2) {
            verbs.add(normalized);
          }
        });
      }
    }
    
    return Array.from(verbs);
  }
  
  /**
   * Extract sources from prompt using registry (UNIVERSAL)
   */
  private extractSources(prompt: string, originalPrompt: string): string[] {
    const sources = new Set<string>();
    
    // ✅ UNIVERSAL: Get all data source nodes from registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check if node is a data source (using capability registry)
      if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
        // Get node label and keywords for matching
        const label = nodeDef.label || nodeType;
        const keywords = nodeDef.tags || [];
        const typeLower = nodeType.toLowerCase();
        const labelLower = label.toLowerCase();
        
        // Create pattern from node label and keywords
        const patterns: RegExp[] = [];
        
        // Add label pattern
        if (labelLower.length > 2) {
          const escapedLabel = labelLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          patterns.push(new RegExp(`\\b${escapedLabel}\\b`, 'gi'));
        }
        
        // Add type pattern (normalized)
        if (typeLower.length > 2) {
          const escapedType = typeLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          patterns.push(new RegExp(`\\b${escapedType}\\b`, 'gi'));
        }
        
        // Add keyword patterns
        for (const keyword of keywords) {
          if (keyword.length > 2) {
            const escapedKeyword = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            patterns.push(new RegExp(`\\b${escapedKeyword}\\b`, 'gi'));
          }
        }
        
        // Check if any pattern matches
        for (const pattern of patterns) {
          const matches = originalPrompt.match(pattern);
          if (matches) {
            // Use node label as the source name (more user-friendly)
            sources.add(label);
            break; // Found this node, move to next
          }
        }
      }
    }
    
    return Array.from(sources);
  }
  
  /**
   * Extract destinations from prompt using registry (UNIVERSAL)
   */
  private extractDestinations(prompt: string, originalPrompt: string): string[] {
    const destinations = new Set<string>();
    
    // ✅ UNIVERSAL: Get all output nodes from registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check if node is an output (using capability registry)
      if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
        // Get node label and keywords for matching
        const label = nodeDef.label || nodeType;
        const keywords = nodeDef.tags || [];
        const typeLower = nodeType.toLowerCase();
        const labelLower = label.toLowerCase();
        
        // Create pattern from node label and keywords
        const patterns: RegExp[] = [];
        
        // Add label pattern
        if (labelLower.length > 2) {
          const escapedLabel = labelLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          patterns.push(new RegExp(`\\b${escapedLabel}\\b`, 'gi'));
        }
        
        // Add type pattern (normalized)
        if (typeLower.length > 2) {
          const escapedType = typeLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          patterns.push(new RegExp(`\\b${escapedType}\\b`, 'gi'));
        }
        
        // Add keyword patterns
        for (const keyword of keywords) {
          if (keyword.length > 2) {
            const escapedKeyword = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            patterns.push(new RegExp(`\\b${escapedKeyword}\\b`, 'gi'));
          }
        }
        
        // Check if any pattern matches
        for (const pattern of patterns) {
          const matches = originalPrompt.match(pattern);
          if (matches) {
            // Use node label as the destination name (more user-friendly)
            destinations.add(label);
            break; // Found this node, move to next
          }
        }
      }
    }
    
    return Array.from(destinations);
  }
  
  /**
   * Extract trigger from prompt
   */
  private extractTrigger(prompt: string): SimpleIntent['trigger'] {
    if (/\b(schedule|scheduled|daily|hourly|weekly|monthly|cron)\b/.test(prompt)) {
      return { type: 'schedule' };
    }
    if (/\b(webhook|webhooks?|api\s*endpoint)\b/.test(prompt)) {
      return { type: 'webhook' };
    }
    if (/\b(form|forms?|submit|submission)\b/.test(prompt)) {
      return { type: 'form' };
    }
    if (/\b(chat|message|messaging)\b/.test(prompt)) {
      return { type: 'chat' };
    }
    if (/\b(when|whenever|on|triggered|trigger)\b/.test(prompt)) {
      return { type: 'event', description: 'Event-based trigger' };
    }
    
    // Default to manual
    return { type: 'manual' };
  }
  
  /**
   * Extract conditions from prompt
   */
  private extractConditions(prompt: string, originalPrompt: string): Array<{ description: string; type?: 'if' | 'switch' | 'loop' }> {
    const conditions: Array<{ description: string; type?: 'if' | 'switch' | 'loop' }> = [];
    
    // Look for "if" statements
    const ifMatches = originalPrompt.match(/\bif\s+([^,\.]+)/gi);
    if (ifMatches) {
      ifMatches.forEach(match => {
        conditions.push({
          description: match.trim(),
          type: 'if'
        });
      });
    }
    
    // Look for "when" statements (often used as conditions)
    const whenMatches = originalPrompt.match(/\bwhen\s+([^,\.]+)/gi);
    if (whenMatches) {
      whenMatches.forEach(match => {
        conditions.push({
          description: match.trim(),
          type: 'if'
        });
      });
    }
    
    return conditions;
  }
  
  /**
   * Extract transformations from prompt using capability registry (UNIVERSAL)
   */
  private extractTransformations(prompt: string): string[] {
    const transformations = new Set<string>();
    
    // ✅ UNIVERSAL: Get all transformation nodes from registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check if node is a transformation (using capability registry)
      if (nodeCapabilityRegistryDSL.isTransformation(nodeType)) {
        // Get node label and keywords for matching
        const label = nodeDef.label || nodeType;
        const keywords = nodeDef.tags || [];
        const typeLower = nodeType.toLowerCase();
        const labelLower = label.toLowerCase();
        
        // Create pattern from node label and keywords
        const patterns: RegExp[] = [];
        
        // Add label pattern
        if (labelLower.length > 2) {
          const escapedLabel = labelLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          patterns.push(new RegExp(`\\b${escapedLabel}\\b`, 'gi'));
        }
        
        // Add type pattern (normalized)
        if (typeLower.length > 2) {
          const escapedType = typeLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          patterns.push(new RegExp(`\\b${escapedType}\\b`, 'gi'));
        }
        
        // Add keyword patterns
        for (const keyword of keywords) {
          if (keyword.length > 2) {
            const escapedKeyword = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            patterns.push(new RegExp(`\\b${escapedKeyword}\\b`, 'gi'));
          }
        }
        
        // Check if any pattern matches
        for (const pattern of patterns) {
          const matches = prompt.match(pattern);
          if (matches) {
            // Normalize transformation name (remove -ing, -s, etc.)
            const normalized = labelLower.replace(/ing$|s$|er$/, '');
            if (normalized.length > 2) {
              transformations.add(normalized);
            }
            break; // Found this node, move to next
          }
        }
      }
    }
    
    return Array.from(transformations);
  }
  
  /**
   * Extract providers from prompt using registry (UNIVERSAL)
   */
  private extractProviders(prompt: string, originalPrompt: string): string[] {
    const providers = new Set<string>();
    
    // ✅ UNIVERSAL: Get all node types from registry and extract provider names
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    const providerNames = new Set<string>();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Extract provider name from node label or type
      // Provider is usually the first part of the label (e.g., "Google Sheets" → "Google")
      const label = nodeDef.label || nodeType;
      const labelParts = label.split(/\s+/);
      
      if (labelParts.length > 1) {
        // Multi-word label - first word is usually provider
        providerNames.add(labelParts[0]);
      } else {
        // Single word - extract provider from node type pattern
        // ✅ UNIVERSAL: Extract provider from node type (e.g., "google_sheets" → "Google")
        const typeLower = nodeType.toLowerCase();
        const typeParts = typeLower.split(/[_\s-]+/);
        
        // Common provider patterns in node types
        // This is semantic extraction, not hardcoding specific providers
        if (typeParts.length > 1) {
          // Multi-part type - first part might be provider
          const firstPart = typeParts[0];
          // Capitalize first letter for provider name
          providerNames.add(firstPart.charAt(0).toUpperCase() + firstPart.slice(1));
        } else {
          // Single part - use label if available, otherwise skip
          // Provider extraction from single-word types is unreliable
        }
      }
    }
    
    // Match provider names in prompt
    for (const provider of providerNames) {
      const escapedProvider = provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escapedProvider}\\b`, 'gi');
      const matches = originalPrompt.match(pattern);
      if (matches) {
        providers.add(provider);
      }
    }
    
    return Array.from(providers);
  }
  
  /**
   * Calculate confidence for rule-based extraction
   */
  private calculateConfidence(intent: SimpleIntent): number {
    let score = 0;
    let maxScore = 0;
    
    // Verbs are important
    maxScore += 1;
    if (intent.verbs.length > 0) {
      score += Math.min(1, intent.verbs.length / 3); // Cap at 1
    }
    
    // Sources or destinations are important
    maxScore += 1;
    if (intent.sources.length > 0 || intent.destinations.length > 0) {
      score += 1;
    }
    
    // Trigger helps
    maxScore += 0.5;
    if (intent.trigger) {
      score += 0.5;
    }
    
    // Rule-based extraction is generally less confident than LLM
    const baseConfidence = maxScore > 0 ? score / maxScore : 0;
    
    // Cap at 0.7 (rule-based is less confident than LLM)
    return Math.min(0.7, baseConfidence);
  }
}

// Export singleton instance
export const fallbackIntentGenerator = FallbackIntentGenerator.getInstance();
