/**
 * Fallback Strategies
 * 
 * ✅ PHASE 4: Graceful degradation when LLM fails
 * 
 * This system:
 * - Provides multiple fallback strategies
 * - Gracefully degrades when LLM unavailable
 * - Uses rule-based extraction as fallback
 * - Uses template matching as fallback
 * - Uses keyword-based selection as fallback
 * 
 * Architecture Rule:
 * - System must work even when LLM is unavailable
 * - Fallbacks use registry (universal)
 * - No hardcoded fallback logic
 */

import { SimpleIntent } from './simple-intent';
import { StructuredIntent } from './intent-structurer';
import { fallbackIntentGenerator } from './fallback-intent-generator';
import { templateBasedGenerator } from './template-based-generator';
import { keywordNodeSelector } from './keyword-node-selector';
import { intentAwarePlanner } from './intent-aware-planner';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

export interface FallbackResult<T> {
  success: boolean;
  result?: T;
  strategy: string;
  confidence: number;
  warnings: string[];
}

export class FallbackStrategies {
  private static instance: FallbackStrategies;
  
  private constructor() {}
  
  static getInstance(): FallbackStrategies {
    if (!FallbackStrategies.instance) {
      FallbackStrategies.instance = new FallbackStrategies();
    }
    return FallbackStrategies.instance;
  }
  
  /**
   * Extract SimpleIntent with fallback strategies
   * 
   * Strategy order:
   * 1. LLM extraction (primary)
   * 2. Rule-based extraction (fallback 1)
   * 3. Keyword-based extraction (fallback 2)
   * 4. Minimal intent (fallback 3)
   */
  async extractSimpleIntentWithFallback(
    prompt: string,
    llmExtraction?: () => Promise<SimpleIntent>
  ): Promise<FallbackResult<SimpleIntent>> {
    const warnings: string[] = [];
    
    // ✅ STRATEGY 1: Try LLM extraction (if provided)
    if (llmExtraction) {
      try {
        const intent = await llmExtraction();
        return {
          success: true,
          result: intent,
          strategy: 'llm',
          confidence: 0.9,
          warnings,
        };
      } catch (error) {
        warnings.push(`LLM extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // ✅ STRATEGY 2: Rule-based extraction (fallback 1)
    try {
      const ruleBasedResult = fallbackIntentGenerator.generateFromPrompt(prompt);
      if (ruleBasedResult.confidence >= 0.5) {
        return {
          success: true,
          result: ruleBasedResult.intent,
          strategy: 'rule-based',
          confidence: ruleBasedResult.confidence,
          warnings: [...warnings, 'Used rule-based extraction (LLM unavailable)'],
        };
      }
    } catch (error) {
      warnings.push(`Rule-based extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // ✅ STRATEGY 3: Keyword-based extraction (fallback 2)
    try {
      const keywordIntent = this.extractFromKeywords(prompt);
      if (keywordIntent && keywordIntent.verbs.length > 0) {
        return {
          success: true,
          result: keywordIntent,
          strategy: 'keyword-based',
          confidence: 0.6,
          warnings: [...warnings, 'Used keyword-based extraction'],
        };
      }
    } catch (error) {
      warnings.push(`Keyword-based extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // ✅ STRATEGY 4: Minimal intent (fallback 3)
    const minimalIntent: SimpleIntent = {
      verbs: ['execute'],
      sources: [],
      destinations: [],
      trigger: { type: 'manual' },
    };
    
    return {
      success: true,
      result: minimalIntent,
      strategy: 'minimal',
      confidence: 0.3,
      warnings: [...warnings, 'Used minimal intent (all extraction methods failed)'],
    };
  }
  
  /**
   * Build StructuredIntent with fallback strategies
   * 
   * Strategy order:
   * 1. Intent-Aware Planner (primary)
   * 2. Template matching (fallback 1)
   * 3. Keyword-based planning (fallback 2)
   * 4. Minimal StructuredIntent (fallback 3)
   */
  async buildStructuredIntentWithFallback(
    simpleIntent: SimpleIntent,
    originalPrompt?: string
  ): Promise<FallbackResult<StructuredIntent>> {
    const warnings: string[] = [];
    
    // ✅ STRATEGY 1: Intent-Aware Planner (primary)
    try {
      const planningResult = await intentAwarePlanner.planWorkflow(simpleIntent, originalPrompt);
      if (planningResult.errors.length === 0) {
        return {
          success: true,
          result: planningResult.structuredIntent,
          strategy: 'intent-aware-planner',
          confidence: 0.9,
          warnings,
        };
      } else {
        warnings.push(`Intent-Aware Planner had errors: ${planningResult.errors.join(', ')}`);
      }
    } catch (error) {
      warnings.push(`Intent-Aware Planner failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // ✅ STRATEGY 2: Template matching (fallback 1)
    try {
      const templateMatch = templateBasedGenerator.matchTemplate(simpleIntent);
      if (templateMatch.template && templateMatch.confidence >= 0.6) {
        const structuredIntent = templateBasedGenerator.generateFromTemplate(templateMatch.template, simpleIntent);
        return {
          success: true,
          result: structuredIntent,
          strategy: 'template-matching',
          confidence: templateMatch.confidence,
          warnings: [...warnings, `Used template: ${templateMatch.template.name}`],
        };
      }
    } catch (error) {
      warnings.push(`Template matching failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // ✅ STRATEGY 3: Keyword-based planning (fallback 2)
    try {
      const keywordStructuredIntent = this.buildFromKeywords(simpleIntent, originalPrompt);
      if (keywordStructuredIntent) {
        return {
          success: true,
          result: keywordStructuredIntent,
          strategy: 'keyword-based',
          confidence: 0.6,
          warnings: [...warnings, 'Used keyword-based planning'],
        };
      }
    } catch (error) {
      warnings.push(`Keyword-based planning failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // ✅ STRATEGY 4: Minimal StructuredIntent (fallback 3)
    const minimalStructuredIntent: StructuredIntent = {
      trigger: simpleIntent.trigger?.type || 'manual_trigger',
      trigger_config: simpleIntent.trigger?.type === 'schedule' ? {} : undefined,
      actions: [],
      requires_credentials: [],
    };
    
    return {
      success: true,
      result: minimalStructuredIntent,
      strategy: 'minimal',
      confidence: 0.3,
      warnings: [...warnings, 'Used minimal StructuredIntent (all planning methods failed)'],
    };
  }
  
  /**
   * Extract SimpleIntent from keywords (UNIVERSAL)
   */
  private extractFromKeywords(prompt: string): SimpleIntent | null {
    const promptLower = prompt.toLowerCase();
    const verbs: string[] = [];
    const sources: string[] = [];
    const destinations: string[] = [];
    
    // Extract verbs
    const verbKeywords = ['send', 'read', 'create', 'update', 'delete', 'notify', 'sync', 'copy'];
    for (const verb of verbKeywords) {
      if (promptLower.includes(verb)) {
        verbs.push(verb);
      }
    }
    
    // ✅ UNIVERSAL: Extract sources using registry
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      if (nodeCapabilityRegistryDSL.isDataSource(nodeType)) {
        const label = nodeDef.label || nodeType;
        const labelLower = label.toLowerCase();
        const typeLower = nodeType.toLowerCase();
        
        if (promptLower.includes(labelLower) || promptLower.includes(typeLower)) {
          sources.push(label);
        }
      }
    }
    
    // ✅ UNIVERSAL: Extract destinations using registry
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      if (nodeCapabilityRegistryDSL.isOutput(nodeType)) {
        const label = nodeDef.label || nodeType;
        const labelLower = label.toLowerCase();
        const typeLower = nodeType.toLowerCase();
        
        if (promptLower.includes(labelLower) || promptLower.includes(typeLower)) {
          destinations.push(label);
        }
      }
    }
    
    if (verbs.length === 0 && sources.length === 0 && destinations.length === 0) {
      return null;
    }
    
    return {
      verbs: verbs.length > 0 ? verbs : ['execute'],
      sources,
      destinations,
      trigger: { type: 'manual' },
    };
  }
  
  /**
   * Build StructuredIntent from keywords (UNIVERSAL)
   */
  private buildFromKeywords(
    simpleIntent: SimpleIntent,
    originalPrompt?: string
  ): StructuredIntent | null {
    const actions: Array<{ type: string; operation: string }> = [];
    const dataSources: Array<{ type: string; operation: string }> = [];
    
    // ✅ UNIVERSAL: Map sources to node types using registry
    if (simpleIntent.sources && simpleIntent.sources.length > 0) {
      for (const source of simpleIntent.sources) {
        const nodeSelection = keywordNodeSelector.selectBestNode(source, 'dataSource');
        if (nodeSelection) {
          dataSources.push({
            type: nodeSelection.nodeType,
            operation: 'read',
          });
        }
      }
    }
    
    // ✅ UNIVERSAL: Map destinations to node types using registry
    if (simpleIntent.destinations && simpleIntent.destinations.length > 0) {
      for (const destination of simpleIntent.destinations) {
        const nodeSelection = keywordNodeSelector.selectBestNode(destination, 'output');
        if (nodeSelection) {
          const operation = this.inferOperationFromVerbs(simpleIntent.verbs);
          actions.push({
            type: nodeSelection.nodeType,
            operation,
          });
        }
      }
    }
    
    if (actions.length === 0 && dataSources.length === 0) {
      return null;
    }
    
    return {
      trigger: simpleIntent.trigger?.type || 'manual_trigger',
      trigger_config: simpleIntent.trigger?.type === 'schedule' ? {} : undefined,
      actions,
      dataSources: dataSources.length > 0 ? dataSources : undefined,
      requires_credentials: [],
    };
  }
  
  /**
   * Infer operation from verbs
   */
  private inferOperationFromVerbs(verbs: string[]): string {
    if (verbs.includes('send') || verbs.includes('notify')) return 'send';
    if (verbs.includes('create') || verbs.includes('add')) return 'create';
    if (verbs.includes('update') || verbs.includes('modify')) return 'update';
    if (verbs.includes('delete') || verbs.includes('remove')) return 'delete';
    if (verbs.includes('read') || verbs.includes('get') || verbs.includes('fetch')) return 'read';
    return 'execute';
  }
}

// Export singleton instance
export const fallbackStrategies = FallbackStrategies.getInstance();
