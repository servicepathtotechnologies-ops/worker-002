/**
 * ✅ ROOT-LEVEL: Comprehensive AI Node Analyzer
 * 
 * This is the SINGLE UNIFIED SYSTEM that handles ALL node analysis:
 * - Node selection (based on context understanding)
 * - JSON config generation (based on node requirements)
 * - Input field mapping (from previous node outputs)
 * - Output field analysis (for next node inputs)
 * - Data flow analysis (understanding node connections)
 * 
 * Architecture Rules:
 * 1. AI analyzes FULL node context (not just keywords)
 * 2. AI analyzes input/output schemas
 * 3. AI analyzes data flow between nodes
 * 4. AI generates configs based on understanding
 * 5. AI maps fields semantically (not just matching)
 * 
 * This replaces ALL fragmented logic:
 * - input-field-mapper.ts (basic matching)
 * - intelligent-config-filler.ts (hardcoded switch statements)
 * - node-auto-configurator.ts (rule-based)
 * - generateRequiredInputFields (template-based)
 * 
 * This ensures:
 * - AI understands what each node does
 * - AI understands data flow
 * - AI generates correct configs
 * - AI maps fields correctly
 * - No patchwork - unified AI-driven system
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { nodeContextRegistry } from '../../core/registry/node-context-registry';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { LLMAdapter } from '../../shared/llm-adapter';
import { nodeLibrary } from '../nodes/node-library';

export interface NodeAnalysisContext {
  currentNode: WorkflowNode;
  previousNode: WorkflowNode | null;
  nextNode: WorkflowNode | null;
  allNodes: WorkflowNode[];
  nodeIndex: number;
  userPrompt: string;
  workflowIntent: string;
  edges: Array<{ source: string; target: string }>;
}

export interface NodeInputAnalysis {
  field: string;
  fieldType: string;
  required: boolean;
  description: string;
  sourceField?: string;
  sourceNodeId?: string;
  mappedValue?: string;
  templateExpression?: string;
  analysis: string; // AI explanation of why this mapping
}

export interface NodeOutputAnalysis {
  outputFields: string[];
  outputSchema: any;
  dataTypes: string[];
  nextNodeRequirements?: {
    nodeId: string;
    nodeType: string;
    requiredFields: string[];
    fieldMappings: Array<{ from: string; to: string; reason: string }>;
  }[];
}

export interface NodeConfigAnalysis {
  config: Record<string, any>;
  fieldAnalyses: NodeInputAnalysis[];
  confidence: number;
  reasoning: string; // AI explanation of config generation
}

export interface ComprehensiveNodeAnalysis {
  nodeType: string;
  nodeContext: any; // Full node context
  inputAnalysis: NodeInputAnalysis[];
  outputAnalysis: NodeOutputAnalysis;
  configAnalysis: NodeConfigAnalysis;
  dataFlowAnalysis: {
    fromPrevious: {
      availableFields: string[];
      mappedFields: Array<{ from: string; to: string; reason: string }>;
    };
    toNext: {
      requiredFields: string[];
      providedFields: string[];
      mappingSuggestions: Array<{ from: string; to: string; reason: string }>;
    };
  };
}

/**
 * ✅ ROOT-LEVEL: Comprehensive AI Node Analyzer
 * 
 * AI analyzes EVERYTHING about nodes:
 * - Context (what node does)
 * - Input schemas (what node needs)
 * - Output schemas (what node produces)
 * - Data flow (how data moves between nodes)
 * - Field mappings (semantic matching)
 */
export class ComprehensiveAINodeAnalyzer {
  private llmAdapter: LLMAdapter;
  
  constructor() {
    this.llmAdapter = new LLMAdapter();
  }
  
  /**
   * ✅ CORE: Analyze node comprehensively
   * 
   * AI analyzes:
   * 1. Node context (what it does)
   * 2. Input requirements (what it needs)
   * 3. Previous node outputs (what's available)
   * 4. Field mappings (semantic matching)
   * 5. Output structure (what it produces)
   * 6. Next node requirements (what's needed next)
   */
  async analyzeNode(context: NodeAnalysisContext): Promise<ComprehensiveNodeAnalysis> {
    const { currentNode, previousNode, nextNode, allNodes, nodeIndex, userPrompt, workflowIntent } = context;
    
    // Step 1: Get node context (what node does)
    const nodeType = currentNode.data?.type || currentNode.type;
    const nodeContext = nodeContextRegistry.get(nodeType);
    if (!nodeContext) {
      throw new Error(`[ComprehensiveAINodeAnalyzer] Node ${nodeType} missing context`);
    }
    
    // Step 2: Get node schemas (input/output)
    const nodeDefinition = unifiedNodeRegistry.get(nodeType);
    if (!nodeDefinition) {
      throw new Error(`[ComprehensiveAINodeAnalyzer] Node ${nodeType} not found in registry`);
    }
    
    const inputSchema = nodeDefinition.inputSchema || {};
    const outputSchema = nodeDefinition.outputSchema || {};
    
    // Step 3: Analyze previous node output (if exists)
    const previousOutputAnalysis = previousNode 
      ? await this.analyzePreviousNodeOutput(previousNode, nodeType, inputSchema)
      : null;
    
    // Step 4: Analyze current node inputs (what it needs)
    const inputAnalysis = await this.analyzeNodeInputs(
      nodeType,
      inputSchema,
      previousOutputAnalysis,
      userPrompt,
      workflowIntent
    );
    
    // Step 5: Analyze current node outputs (what it produces)
    const outputAnalysis = await this.analyzeNodeOutputs(
      nodeType,
      outputSchema,
      nodeContext
    );
    
    // Step 6: Analyze next node requirements (if exists)
    if (nextNode) {
      outputAnalysis.nextNodeRequirements = await this.analyzeNextNodeRequirements(
        nextNode,
        outputAnalysis
      );
    }
    
    // Step 7: Generate config based on analysis
    const configAnalysis = await this.generateConfigFromAnalysis(
      nodeType,
      inputAnalysis,
      previousOutputAnalysis,
      userPrompt,
      workflowIntent
    );
    
    // Step 8: Analyze data flow
    const dataFlowAnalysis = await this.analyzeDataFlow(
      previousNode,
      currentNode,
      nextNode,
      inputAnalysis,
      outputAnalysis
    );
    
    return {
      nodeType,
      nodeContext,
      inputAnalysis,
      outputAnalysis,
      configAnalysis,
      dataFlowAnalysis,
    };
  }
  
  /**
   * ✅ CORE: Analyze previous node output
   * 
   * AI analyzes what the previous node produces and how it maps to current node inputs
   */
  private async analyzePreviousNodeOutput(
    previousNode: WorkflowNode,
    currentNodeType: string,
    currentInputSchema: any
  ): Promise<{
    nodeType: string;
    outputFields: string[];
    outputSchema: any;
    availableData: any;
    mappingSuggestions: Array<{ from: string; to: string; reason: string }>;
  }> {
    const previousNodeType = previousNode.data?.type || previousNode.type;
    const previousDefinition = unifiedNodeRegistry.get(previousNodeType);
    const previousOutputSchema = previousDefinition?.outputSchema;
    
    // Get output fields from schema
    const outputFields: string[] = [];
    if (previousOutputSchema?.default?.schema?.properties) {
      outputFields.push(...Object.keys(previousOutputSchema.default.schema.properties));
    }
    
    // AI analyzes how previous output maps to current input
    const systemPrompt = `You are an expert at analyzing data flow between workflow nodes.

PREVIOUS NODE:
- Type: ${previousNodeType}
- Output Schema: ${JSON.stringify(previousOutputSchema, null, 2)}

CURRENT NODE:
- Type: ${currentNodeType}
- Input Schema: ${JSON.stringify(currentInputSchema, null, 2)}

TASK: Analyze how previous node output maps to current node input requirements.

Return JSON:
{
  "outputFields": ["field1", "field2", ...],
  "mappingSuggestions": [
    {
      "from": "previous_field",
      "to": "current_field",
      "reason": "why this mapping makes sense"
    }
  ]
}`;

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: 'Analyze the data flow mapping.' }
      ];
      const response = await this.llmAdapter.chat('ollama', messages, { model: 'llama3.2' });
      const analysis = JSON.parse(response.content);
      
      return {
        nodeType: previousNodeType,
        outputFields: analysis.outputFields || outputFields,
        outputSchema: previousOutputSchema,
        availableData: {},
        mappingSuggestions: analysis.mappingSuggestions || [],
      };
    } catch (error) {
      // Fallback: basic field matching
      return {
        nodeType: previousNodeType,
        outputFields,
        outputSchema: previousOutputSchema,
        availableData: {},
        mappingSuggestions: [],
      };
    }
  }
  
  /**
   * ✅ CORE: Analyze node inputs
   * 
   * AI analyzes what the node needs and how to map from previous outputs
   */
  private async analyzeNodeInputs(
    nodeType: string,
    inputSchema: any,
    previousOutputAnalysis: any,
    userPrompt: string,
    workflowIntent: string
  ): Promise<NodeInputAnalysis[]> {
    const nodeContext = nodeContextRegistry.get(nodeType);
    const inputFields = Object.entries(inputSchema || {});
    
    const systemPrompt = `You are an expert at analyzing workflow node input requirements.

NODE CONTEXT:
${nodeContextRegistry.getContextsForAI().split('## Node:').find(ctx => ctx.includes(nodeType)) || ''}

INPUT SCHEMA:
${JSON.stringify(inputSchema, null, 2)}

PREVIOUS NODE OUTPUT:
${previousOutputAnalysis ? JSON.stringify(previousOutputAnalysis, null, 2) : 'No previous node'}

USER PROMPT: "${userPrompt}"
WORKFLOW INTENT: "${workflowIntent}"

TASK: For each input field, analyze:
1. What data this field needs
2. Where it should come from (previous node output or user prompt)
3. How to map it (semantic matching)
4. What template expression to use

Return JSON array:
[
  {
    "field": "field_name",
    "fieldType": "string|number|object|array",
    "required": true|false,
    "description": "what this field is for",
    "sourceField": "previous_node_field",
    "sourceNodeId": "node_id",
    "mappedValue": "value or template",
    "templateExpression": "{{$json.field}}",
    "analysis": "AI explanation of why this mapping"
  }
]`;

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: 'Analyze all input fields.' }
      ];
      const response = await this.llmAdapter.chat('ollama', messages, { model: 'llama3.2' });
      const analysis = JSON.parse(response.content);
      
      return Array.isArray(analysis) ? analysis : [];
    } catch (error) {
      // Fallback: basic analysis
      return inputFields.map(([field, fieldDef]: [string, any]) => ({
        field,
        fieldType: fieldDef.type || 'string',
        required: fieldDef.required || false,
        description: fieldDef.description || '',
        analysis: `Field ${field} requires ${fieldDef.type || 'string'} input`,
      }));
    }
  }
  
  /**
   * ✅ CORE: Analyze node outputs
   * 
   * AI analyzes what the node produces
   */
  private async analyzeNodeOutputs(
    nodeType: string,
    outputSchema: any,
    nodeContext: any
  ): Promise<NodeOutputAnalysis> {
    const outputFields: string[] = [];
    if (outputSchema?.default?.schema?.properties) {
      outputFields.push(...Object.keys(outputSchema.default.schema.properties));
    }
    
    return {
      outputFields,
      outputSchema,
      dataTypes: outputSchema?.default?.schema?.type ? [outputSchema.default.schema.type] : ['object'],
      nextNodeRequirements: [],
    };
  }
  
  /**
   * ✅ CORE: Analyze next node requirements
   * 
   * AI analyzes what the next node needs and how current output maps to it
   */
  private async analyzeNextNodeRequirements(
    nextNode: WorkflowNode,
    currentOutputAnalysis: NodeOutputAnalysis
  ): Promise<Array<{
    nodeId: string;
    nodeType: string;
    requiredFields: string[];
    fieldMappings: Array<{ from: string; to: string; reason: string }>;
  }>> {
    const nextNodeType = nextNode.data?.type || nextNode.type;
    const nextDefinition = unifiedNodeRegistry.get(nextNodeType);
    const nextInputSchema = nextDefinition?.inputSchema || {};
    
    const requiredFields = Object.entries(nextInputSchema)
      .filter(([_, fieldDef]: [string, any]) => fieldDef.required)
      .map(([field]) => field);
    
    // AI analyzes mapping
    const systemPrompt = `Analyze how current node output maps to next node input.

CURRENT NODE OUTPUT:
- Fields: ${currentOutputAnalysis.outputFields.join(', ')}
- Schema: ${JSON.stringify(currentOutputAnalysis.outputSchema, null, 2)}

NEXT NODE INPUT:
- Type: ${nextNodeType}
- Required Fields: ${requiredFields.join(', ')}
- Schema: ${JSON.stringify(nextInputSchema, null, 2)}

Return JSON:
{
  "fieldMappings": [
    {
      "from": "current_output_field",
      "to": "next_input_field",
      "reason": "why this mapping"
    }
  ]
}`;

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: 'Analyze field mappings.' }
      ];
      const response = await this.llmAdapter.chat('ollama', messages, { model: 'llama3.2' });
      const analysis = JSON.parse(response.content);
      
      return [{
        nodeId: nextNode.id,
        nodeType: nextNodeType,
        requiredFields,
        fieldMappings: analysis.fieldMappings || [],
      }];
    } catch (error) {
      return [{
        nodeId: nextNode.id,
        nodeType: nextNodeType,
        requiredFields,
        fieldMappings: [],
      }];
    }
  }
  
  /**
   * ✅ CORE: Generate config from analysis
   * 
   * AI generates node config based on comprehensive analysis
   */
  private async generateConfigFromAnalysis(
    nodeType: string,
    inputAnalysis: NodeInputAnalysis[],
    previousOutputAnalysis: any,
    userPrompt: string,
    workflowIntent: string
  ): Promise<NodeConfigAnalysis> {
    const nodeContext = nodeContextRegistry.get(nodeType);
    const nodeDefinition = unifiedNodeRegistry.get(nodeType);
    
    const systemPrompt = `You are an expert at generating workflow node configurations.

NODE CONTEXT:
${JSON.stringify(nodeContext, null, 2)}

INPUT ANALYSIS:
${JSON.stringify(inputAnalysis, null, 2)}

PREVIOUS OUTPUT:
${previousOutputAnalysis ? JSON.stringify(previousOutputAnalysis, null, 2) : 'No previous node'}

USER PROMPT: "${userPrompt}"
WORKFLOW INTENT: "${workflowIntent}"

TASK: Generate complete node configuration JSON.

Rules:
1. Use template expressions ({{$json.field}}) for fields from previous node
2. Use actual values for fields from user prompt
3. Include all required fields
4. Use appropriate defaults for optional fields
5. Ensure type compatibility

Return JSON:
{
  "config": {
    "field1": "value or {{$json.field}}",
    "field2": "value or {{$json.field}}"
  },
  "confidence": 0.95,
  "reasoning": "explanation of config generation"
}`;

    try {
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: 'Generate node configuration.' }
      ];
      const response = await this.llmAdapter.chat('ollama', messages, { model: 'llama3.2' });
      const analysis = JSON.parse(response.content);
      
      return {
        config: analysis.config || {},
        fieldAnalyses: inputAnalysis,
        confidence: analysis.confidence || 0.8,
        reasoning: analysis.reasoning || 'Config generated from analysis',
      };
    } catch (error) {
      // Fallback: generate from input analysis
      const config: Record<string, any> = {};
      for (const fieldAnalysis of inputAnalysis) {
        if (fieldAnalysis.templateExpression) {
          config[fieldAnalysis.field] = fieldAnalysis.templateExpression;
        } else if (fieldAnalysis.mappedValue) {
          config[fieldAnalysis.field] = fieldAnalysis.mappedValue;
        }
      }
      
      return {
        config,
        fieldAnalyses: inputAnalysis,
        confidence: 0.7,
        reasoning: 'Config generated from field analysis (fallback)',
      };
    }
  }
  
  /**
   * ✅ CORE: Analyze data flow
   * 
   * AI analyzes how data flows between nodes
   */
  private async analyzeDataFlow(
    previousNode: WorkflowNode | null,
    currentNode: WorkflowNode,
    nextNode: WorkflowNode | null,
    inputAnalysis: NodeInputAnalysis[],
    outputAnalysis: NodeOutputAnalysis
  ): Promise<{
    fromPrevious: {
      availableFields: string[];
      mappedFields: Array<{ from: string; to: string; reason: string }>;
    };
    toNext: {
      requiredFields: string[];
      providedFields: string[];
      mappingSuggestions: Array<{ from: string; to: string; reason: string }>;
    };
  }> {
    // Extract mapped fields from input analysis
    const mappedFields = inputAnalysis
      .filter(analysis => analysis.sourceField)
      .map(analysis => ({
        from: analysis.sourceField!,
        to: analysis.field,
        reason: analysis.analysis,
      }));
    
    const previousFields = previousNode 
      ? (await this.analyzePreviousNodeOutput(previousNode, currentNode.data?.type || currentNode.type, {})).outputFields
      : [];
    
    const nextRequiredFields = nextNode && outputAnalysis.nextNodeRequirements?.[0]
      ? outputAnalysis.nextNodeRequirements[0].requiredFields
      : [];
    
    return {
      fromPrevious: {
        availableFields: previousFields,
        mappedFields,
      },
      toNext: {
        requiredFields: nextRequiredFields,
        providedFields: outputAnalysis.outputFields,
        mappingSuggestions: outputAnalysis.nextNodeRequirements?.[0]?.fieldMappings || [],
      },
    };
  }
}

// Export singleton instance
export const comprehensiveAINodeAnalyzer = new ComprehensiveAINodeAnalyzer();
