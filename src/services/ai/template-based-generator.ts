/**
 * Template-Based Generator
 * 
 * ✅ PHASE 3: Template matching for common workflows
 * 
 * This generator:
 * - Matches SimpleIntent to workflow templates
 * - Provides pre-built workflow structures for common patterns
 * - Reduces LLM dependency for common workflows
 * - Uses registry to validate template nodes
 * 
 * Architecture Rule:
 * - Templates are suggestions, not hardcoded
 * - All template nodes must exist in registry
 * - Templates can be customized based on intent
 */

import { SimpleIntent } from './simple-intent';
import { StructuredIntent } from './intent-structurer';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  intentPattern: {
    verbs?: string[];
    sources?: string[];
    destinations?: string[];
    transformations?: string[];
  };
  structuredIntent: Partial<StructuredIntent>;
  confidence: number; // 0-1, how well this template matches
}

export interface TemplateMatchResult {
  template?: WorkflowTemplate;
  confidence: number;
  reason?: string;
}

export class TemplateBasedGenerator {
  private static instance: TemplateBasedGenerator;
  private templates: WorkflowTemplate[] = [];
  
  private constructor() {
    this.initializeTemplates();
  }
  
  static getInstance(): TemplateBasedGenerator {
    if (!TemplateBasedGenerator.instance) {
      TemplateBasedGenerator.instance = new TemplateBasedGenerator();
    }
    return TemplateBasedGenerator.instance;
  }
  
  /**
   * Initialize workflow templates
   * ✅ UNIVERSAL: Templates are dynamically generated from registry
   * No hardcoded service names - all templates use registry-based node discovery
   */
  private initializeTemplates(): void {
    // ✅ TEMPLATE 1: Data Source to Output notification pattern
    // Pattern: Any data source → Any output (notification pattern)
    this.templates.push({
      id: 'data_source_to_output',
      name: 'Data Source to Output Notification',
      description: 'Send notifications from any data source to any output',
      intentPattern: {
        verbs: ['send', 'notify', 'alert'],
        // No hardcoded sources/destinations - matches any from registry
      },
      structuredIntent: {
        trigger: 'schedule',
        // Node types will be resolved dynamically from registry based on intent entities
        actions: [], // Will be populated from registry based on intent.destinations
        dataSources: [], // Will be populated from registry based on intent.sources
      },
      confidence: 0.9,
    });
    
    // ✅ TEMPLATE 2: Data sync pattern (any source → any destination)
    this.templates.push({
      id: 'data_sync',
      name: 'Data Sync Workflow',
      description: 'Sync data from any source to any destination',
      intentPattern: {
        verbs: ['sync', 'copy', 'transfer', 'move'],
        // No hardcoded sources/destinations - matches any from registry
      },
      structuredIntent: {
        trigger: 'schedule',
        // Node types will be resolved dynamically from registry
        actions: [], // Will be populated from registry
        dataSources: [], // Will be populated from registry
      },
      confidence: 0.85,
    });
    
    // ✅ TEMPLATE 3: AI Transformation pattern
    this.templates.push({
      id: 'ai_transformation',
      name: 'AI Transformation Workflow',
      description: 'Transform data using AI',
      intentPattern: {
        verbs: ['summarize', 'analyze', 'transform', 'process'],
        transformations: ['summarize', 'analyze', 'transform'], // Generic transformation verbs
      },
      structuredIntent: {
        trigger: 'manual_trigger',
        // Transformation node types will be resolved dynamically from registry
        transformations: [], // Will be populated from registry based on intent.transformations
      },
      confidence: 0.8,
    });
    
    // Validate all templates against registry
    this.validateTemplates();
  }
  
  /**
   * Validate templates against registry (UNIVERSAL)
   */
  private validateTemplates(): void {
    const invalidTemplates: string[] = [];
    
    for (const template of this.templates) {
      // Validate all node types in template exist in registry
      const nodeTypes: string[] = [];
      
      if (template.structuredIntent.actions) {
        nodeTypes.push(...template.structuredIntent.actions.map(a => a.type));
      }
      if (template.structuredIntent.dataSources) {
        nodeTypes.push(...template.structuredIntent.dataSources.map(ds => ds.type));
      }
      if (template.structuredIntent.transformations) {
        nodeTypes.push(...template.structuredIntent.transformations.map(tf => tf.type));
      }
      
      // Check if all node types exist in registry
      for (const nodeType of nodeTypes) {
        const normalized = unifiedNormalizeNodeTypeString(nodeType);
        if (!unifiedNodeRegistry.has(normalized)) {
          invalidTemplates.push(`${template.id}: node type ${nodeType} not found in registry`);
        }
      }
    }
    
    if (invalidTemplates.length > 0) {
      console.warn(`[TemplateBasedGenerator] ⚠️  Invalid templates: ${invalidTemplates.join(', ')}`);
      // Remove invalid templates
      this.templates = this.templates.filter(t => 
        !invalidTemplates.some(invalid => invalid.startsWith(t.id))
      );
    }
  }
  
  /**
   * Match SimpleIntent to workflow template
   * 
   * @param intent - SimpleIntent to match
   * @returns Template match result
   */
  matchTemplate(intent: SimpleIntent): TemplateMatchResult {
    let bestMatch: WorkflowTemplate | undefined;
    let bestConfidence = 0;
    let bestReason = '';
    
    for (const template of this.templates) {
      const match = this.calculateTemplateMatch(intent, template);
      
      if (match.confidence > bestConfidence) {
        bestConfidence = match.confidence;
        bestMatch = template;
        bestReason = match.reason || '';
      }
    }
    
    if (bestMatch && bestConfidence >= 0.6) {
      return {
        template: bestMatch,
        confidence: bestConfidence,
        reason: bestReason,
      };
    }
    
    return {
      confidence: 0,
      reason: 'No matching template found',
    };
  }
  
  /**
   * Calculate how well a template matches SimpleIntent
   * ✅ UNIVERSAL: Pattern matching based on verbs/transformations, not hardcoded service names
   */
  private calculateTemplateMatch(
    intent: SimpleIntent,
    template: WorkflowTemplate
  ): { confidence: number; reason?: string } {
    let score = 0;
    let maxScore = 0;
    const reasons: string[] = [];
    
    // Match verbs (pattern-based, not service-specific)
    if (template.intentPattern.verbs && template.intentPattern.verbs.length > 0) {
      maxScore += 1;
      const matchingVerbs = intent.verbs.filter(v => 
        template.intentPattern.verbs!.some(tv => 
          v.toLowerCase().includes(tv.toLowerCase()) || 
          tv.toLowerCase().includes(v.toLowerCase())
        )
      );
      if (matchingVerbs.length > 0) {
        score += matchingVerbs.length / template.intentPattern.verbs.length;
        reasons.push(`Matched ${matchingVerbs.length} verb(s)`);
      }
    }
    
    // ✅ UNIVERSAL: Match sources based on category (any data source), not specific service names
    if (template.intentPattern.sources === undefined || template.intentPattern.sources.length === 0) {
      // Template accepts any data source - check if intent has sources
      if (intent.sources && intent.sources.length > 0) {
        maxScore += 1;
        score += 1; // Any data source matches
        reasons.push(`Has data source(s)`);
      }
    } else {
      // Template has specific source patterns (legacy support)
      maxScore += 1;
      const matchingSources = intent.sources.filter(s => 
        template.intentPattern.sources!.some(ts => 
          s.toLowerCase().includes(ts.toLowerCase()) || 
          ts.toLowerCase().includes(s.toLowerCase())
        )
      );
      if (matchingSources.length > 0) {
        score += matchingSources.length / template.intentPattern.sources.length;
        reasons.push(`Matched ${matchingSources.length} source(s)`);
      }
    }
    
    // ✅ UNIVERSAL: Match destinations based on category (any output), not specific service names
    if (template.intentPattern.destinations === undefined || template.intentPattern.destinations.length === 0) {
      // Template accepts any output - check if intent has destinations
      if (intent.destinations && intent.destinations.length > 0) {
        maxScore += 1;
        score += 1; // Any output matches
        reasons.push(`Has destination(s)`);
      }
    } else {
      // Template has specific destination patterns (legacy support)
      maxScore += 1;
      const matchingDestinations = intent.destinations.filter(d => 
        template.intentPattern.destinations!.some(td => 
          d.toLowerCase().includes(td.toLowerCase()) || 
          td.toLowerCase().includes(d.toLowerCase())
        )
      );
      if (matchingDestinations.length > 0) {
        score += matchingDestinations.length / template.intentPattern.destinations.length;
        reasons.push(`Matched ${matchingDestinations.length} destination(s)`);
      }
    }
    
    // Match transformations (pattern-based, not service-specific)
    if (template.intentPattern.transformations && template.intentPattern.transformations.length > 0) {
      maxScore += 1;
      const matchingTransformations = intent.transformations?.filter(t => 
        template.intentPattern.transformations!.some(tt => 
          t.toLowerCase().includes(tt.toLowerCase()) || 
          tt.toLowerCase().includes(t.toLowerCase())
        )
      ) || [];
      if (matchingTransformations.length > 0) {
        score += matchingTransformations.length / template.intentPattern.transformations.length;
        reasons.push(`Matched ${matchingTransformations.length} transformation(s)`);
      }
    }
    
    const confidence = maxScore > 0 ? score / maxScore : 0;
    
    return {
      confidence,
      reason: reasons.join(', '),
    };
  }
  
  /**
   * Generate StructuredIntent from template
   * 
   * ✅ UNIVERSAL: All node types are resolved dynamically from registry
   * No hardcoded node types - everything comes from registry based on intent entities
   * 
   * @param template - Matched template
   * @param intent - SimpleIntent (for customization)
   * @returns StructuredIntent based on template
   */
  generateFromTemplate(
    template: WorkflowTemplate,
    intent: SimpleIntent
  ): StructuredIntent {
    // Start with template's StructuredIntent structure
    const structuredIntent: StructuredIntent = {
      trigger: template.structuredIntent.trigger || 'manual_trigger',
      trigger_config: template.structuredIntent.trigger_config,
      actions: [],
      dataSources: [],
      transformations: [],
      conditions: template.structuredIntent.conditions,
      requires_credentials: [],
    };
    
    // ✅ UNIVERSAL: Map intent entities to node types using registry
    // Data sources
    if (intent.sources && intent.sources.length > 0) {
      for (const source of intent.sources) {
        const nodeType = this.mapEntityToNodeType(source, 'dataSource');
        if (nodeType) {
          structuredIntent.dataSources!.push({
            type: nodeType,
            operation: 'read',
          });
        }
      }
    }
    
    // Transformations
    if (intent.transformations && intent.transformations.length > 0) {
      for (const transformation of intent.transformations) {
        const nodeType = this.mapEntityToNodeType(transformation, 'transformation');
        if (nodeType) {
          structuredIntent.transformations!.push({
            type: nodeType,
            operation: 'transform',
          });
        }
      }
    }
    
    // Outputs (actions)
    if (intent.destinations && intent.destinations.length > 0) {
      for (const destination of intent.destinations) {
        const nodeType = this.mapEntityToNodeType(destination, 'output');
        if (nodeType) {
          // Infer operation from verbs
          const operation = this.inferOperationFromVerbs(intent.verbs);
          structuredIntent.actions.push({
            type: nodeType,
            operation,
          });
        }
      }
    }
    
    // Extract required credentials
    structuredIntent.requires_credentials = this.extractCredentials(structuredIntent);
    
    return structuredIntent;
  }
  
  /**
   * Infer operation from verbs (UNIVERSAL - no hardcoded service names)
   */
  private inferOperationFromVerbs(verbs: string[]): string {
    if (verbs.includes('send') || verbs.includes('notify')) return 'send';
    if (verbs.includes('create') || verbs.includes('add')) return 'create';
    if (verbs.includes('update') || verbs.includes('modify')) return 'update';
    if (verbs.includes('delete') || verbs.includes('remove')) return 'delete';
    if (verbs.includes('read') || verbs.includes('get') || verbs.includes('fetch')) return 'read';
    return 'execute';
  }
  
  /**
   * Map entity to node type using registry (UNIVERSAL)
   */
  private mapEntityToNodeType(
    entity: string,
    category: 'dataSource' | 'transformation' | 'output'
  ): string | null {
    const entityLower = entity.toLowerCase();
    const allNodeTypes = unifiedNodeRegistry.getAllTypes();
    
    for (const nodeType of allNodeTypes) {
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) continue;
      
      // Check category
      const isCorrectCategory = 
        (category === 'dataSource' && nodeCapabilityRegistryDSL.isDataSource(nodeType)) ||
        (category === 'transformation' && nodeCapabilityRegistryDSL.isTransformation(nodeType)) ||
        (category === 'output' && nodeCapabilityRegistryDSL.isOutput(nodeType));
      
      if (!isCorrectCategory) continue;
      
      // Check match
      const label = nodeDef.label || nodeType;
      const labelLower = label.toLowerCase();
      const typeLower = nodeType.toLowerCase();
      
      if (labelLower.includes(entityLower) || entityLower.includes(labelLower) ||
          typeLower.includes(entityLower) || entityLower.includes(typeLower)) {
        return nodeType;
      }
    }
    
    return null;
  }
  
  /**
   * Extract required credentials from StructuredIntent
   */
  private extractCredentials(intent: StructuredIntent): string[] {
    const credentials = new Set<string>();
    
    const allNodes = [
      ...(intent.actions || []),
      ...(intent.dataSources || []),
      ...(intent.transformations || []),
    ];
    
    for (const node of allNodes) {
      const nodeDef = unifiedNodeRegistry.get(unifiedNormalizeNodeTypeString(node.type));
      if (!nodeDef || !nodeDef.credentialSchema) continue;
      
      const requirements = nodeDef.credentialSchema.requirements || [];
      for (const req of requirements) {
        if (req.category) {
          credentials.add(req.category);
        }
      }
    }
    
    return Array.from(credentials);
  }
}

// Export singleton instance
export const templateBasedGenerator = TemplateBasedGenerator.getInstance();
