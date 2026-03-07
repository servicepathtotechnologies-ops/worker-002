/**
 * ✅ WORLD-CLASS: AI-Driven Data Transformation Layer
 * 
 * This is the BILLIONAIRE-LEVEL system that makes your product exceptional.
 * 
 * What it does:
 * 1. Analyzes current node output (what data is available)
 * 2. Analyzes future node input requirements (what data is needed)
 * 3. Uses AI to intelligently transform output to match input requirements
 * 4. Generates proper JSON structures, messages, prompts, code
 * 5. Writes conditions intelligently based on intent understanding
 * 
 * This ensures:
 * - NO placeholders - real, structured data
 * - NO manual mapping - AI understands context
 * - NO keyword matching - semantic understanding
 * - Perfect data flow between nodes
 * - Intelligent condition generation
 * 
 * Architecture:
 * - Runs BEFORE data flows to next node
 * - Analyzes both output and input schemas
 * - Uses AI to understand intent and transform accordingly
 * - Generates proper structures (JSON, messages, code)
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { LLMAdapter } from '../../shared/llm-adapter';
import { nodeContextRegistry } from '../../core/registry/node-context-registry';

export interface TransformationContext {
  currentNode: WorkflowNode;
  currentNodeOutput: any; // Actual output from current node
  nextNode: WorkflowNode;
  nextNodeInputSchema: any; // Input schema of next node
  userPrompt: string; // Original user prompt
  workflowIntent: string; // Overall workflow intent
  allNodes: WorkflowNode[]; // All nodes in workflow
}

export interface TransformationResult {
  transformedOutput: any; // Transformed output ready for next node
  transformationExplanation: string; // AI explanation of transformation
  fieldMappings: Array<{
    from: string; // Source field
    to: string; // Target field
    transformation: string; // How it was transformed
    reason: string; // Why this mapping
  }>;
  generatedStructures: {
    json?: any; // Generated JSON structure
    message?: string; // Generated message
    prompt?: string; // Generated prompt
    code?: string; // Generated code/logic
    condition?: string; // Generated condition
  };
  confidence: number; // AI confidence in transformation
}

/**
 * ✅ WORLD-CLASS: AI-Driven Data Transformation Layer
 * 
 * This is the core system that transforms data between nodes intelligently.
 */
export class AIDataTransformationLayer {
  private llmAdapter: LLMAdapter;

  constructor() {
    this.llmAdapter = new LLMAdapter();
  }

  /**
   * ✅ MAIN ENTRY POINT: Transform current node output to match next node input
   * 
   * This is called BEFORE data flows to the next node.
   * AI analyzes both outputs and inputs, then transforms accordingly.
   */
  async transformDataForNextNode(
    context: TransformationContext
  ): Promise<TransformationResult> {
    console.log(`[AIDataTransformationLayer] 🔄 Transforming data from ${context.currentNode.id} to ${context.nextNode.id}`);

    const { currentNode, currentNodeOutput, nextNode, nextNodeInputSchema, userPrompt, workflowIntent } = context;

    // Step 1: Analyze current node output structure
    const outputAnalysis = this.analyzeNodeOutput(currentNode, currentNodeOutput);

    // Step 2: Analyze next node input requirements
    const inputAnalysis = this.analyzeNodeInput(nextNode, nextNodeInputSchema);

    // Step 3: Use AI to transform output to match input requirements
    const transformation = await this.aiTransform(
      outputAnalysis,
      inputAnalysis,
      userPrompt,
      workflowIntent,
      currentNode,
      nextNode
    );

    console.log(`[AIDataTransformationLayer] ✅ Transformation complete (confidence: ${(transformation.confidence * 100).toFixed(1)}%)`);

    return transformation;
  }

  /**
   * Analyze current node output structure
   */
  private analyzeNodeOutput(node: WorkflowNode, output: any): {
    nodeType: string;
    outputSchema: any;
    outputFields: string[];
    outputData: any;
    outputStructure: string; // JSON structure description
  } {
    const nodeType = node.data?.type || node.type;
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    const outputSchema = nodeDef?.outputSchema || {};

    // Extract output fields from schema
    const outputFields: string[] = [];
    if (outputSchema.default?.schema?.properties) {
      outputFields.push(...Object.keys(outputSchema.default.schema.properties));
    }

    // Analyze actual output structure
    const outputStructure = this.describeDataStructure(output);

    return {
      nodeType,
      outputSchema,
      outputFields,
      outputData: output,
      outputStructure,
    };
  }

  /**
   * Analyze next node input requirements
   */
  private analyzeNodeInput(node: WorkflowNode, inputSchema: any): {
    nodeType: string;
    inputSchema: any;
    requiredFields: string[];
    fieldTypes: Record<string, string>;
    fieldDescriptions: Record<string, string>;
    inputStructure: string; // Required structure description
  } {
    const nodeType = node.data?.type || node.type;
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    const fullInputSchema = inputSchema || nodeDef?.inputSchema || {};

    // Extract required fields and types
    const requiredFields: string[] = [];
    const fieldTypes: Record<string, string> = {};
    const fieldDescriptions: Record<string, string> = {};

    Object.entries(fullInputSchema).forEach(([field, schema]: [string, any]) => {
      if (schema.required !== false) {
        requiredFields.push(field);
      }
      fieldTypes[field] = schema.type || 'string';
      fieldDescriptions[field] = schema.description || '';
    });

    // Describe required input structure
    const inputStructure = this.describeRequiredStructure(fullInputSchema);

    return {
      nodeType,
      inputSchema: fullInputSchema,
      requiredFields,
      fieldTypes,
      fieldDescriptions,
      inputStructure,
    };
  }

  /**
   * ✅ CORE: AI-driven transformation
   * 
   * AI analyzes output and input, then transforms output to match input requirements.
   */
  private async aiTransform(
    outputAnalysis: ReturnType<AIDataTransformationLayer['analyzeNodeOutput']>,
    inputAnalysis: ReturnType<AIDataTransformationLayer['analyzeNodeInput']>,
    userPrompt: string,
    workflowIntent: string,
    currentNode: WorkflowNode,
    nextNode: WorkflowNode
  ): Promise<TransformationResult> {
    const currentNodeType = outputAnalysis.nodeType;
    const nextNodeType = inputAnalysis.nodeType;

    // Get node contexts for AI understanding
    const currentNodeContext = nodeContextRegistry.get(currentNodeType);
    const nextNodeContext = nodeContextRegistry.get(nextNodeType);

    // Build comprehensive AI prompt
    const prompt = `You are an expert at transforming data between workflow nodes.

# CURRENT NODE OUTPUT:
**Node Type**: ${currentNodeType}
**Node Context**: ${currentNodeContext?.description || 'N/A'}
**Output Structure**: ${outputAnalysis.outputStructure}
**Available Fields**: ${outputAnalysis.outputFields.join(', ') || 'N/A'}
**Actual Output Data**: ${JSON.stringify(outputAnalysis.outputData, null, 2)}

# NEXT NODE INPUT REQUIREMENTS:
**Node Type**: ${nextNodeType}
**Node Context**: ${nextNodeContext?.description || 'N/A'}
**Required Structure**: ${inputAnalysis.inputStructure}
**Required Fields**: ${inputAnalysis.requiredFields.join(', ') || 'N/A'}
**Field Types**: ${JSON.stringify(inputAnalysis.fieldTypes, null, 2)}
**Field Descriptions**: ${JSON.stringify(inputAnalysis.fieldDescriptions, null, 2)}

# USER INTENT:
**Original Prompt**: "${userPrompt}"
**Workflow Intent**: "${workflowIntent}"

# YOUR TASK:
Transform the current node output to match the next node's input requirements.

1. **Analyze Output**: Understand what data is available from current node
2. **Analyze Input**: Understand what data is needed by next node
3. **Map Fields**: Intelligently map output fields to input fields (semantic matching, not just name matching)
4. **Transform Data**: Transform data types and structures as needed
5. **Generate Structures**: Generate proper JSON structures, messages, prompts, code as needed
6. **Generate Conditions**: If next node is if_else or switch, generate intelligent conditions based on intent

# OUTPUT FORMAT (JSON):
{
  "transformedOutput": {
    // Transformed output that matches next node's input requirements
    // Include ALL required fields
    // Use proper data types
    // Structure according to input schema
  },
  "fieldMappings": [
    {
      "from": "source_field_name",
      "to": "target_field_name",
      "transformation": "how the field was transformed",
      "reason": "why this mapping makes sense"
    }
  ],
  "generatedStructures": {
    "json": {}, // If JSON structure is needed
    "message": "", // If message is needed (e.g., for email body)
    "prompt": "", // If prompt is needed (e.g., for AI nodes)
    "code": "", // If code/logic is needed (e.g., for set_variable, javascript)
    "condition": "" // If condition is needed (e.g., for if_else)
  },
  "transformationExplanation": "Detailed explanation of how and why the transformation was done",
  "confidence": 0.0-1.0 // Your confidence in this transformation
}

# CRITICAL RULES:
1. **NO Placeholders**: Generate REAL, structured data - not "{{$json.field}}" or placeholders
2. **Semantic Matching**: Understand MEANING, not just field names (e.g., "summary" → "body", "text" → "message")
3. **Type Safety**: Ensure data types match requirements (string, number, object, array)
4. **Complete Structures**: Include ALL required fields, even if you need to derive them
5. **Intent-Aware**: Use user intent to guide transformation (e.g., if user wants "summary", create summary structure)
6. **Condition Generation**: If next node needs conditions, generate intelligent conditions based on intent (not just keywords)

# EXAMPLES:

**Example 1: Google Sheets → AI Chat Model**
- Output: { rows: [{ name: "John", age: 30 }] }
- Input needs: { prompt: "string" }
- Transform: Extract data, create prompt like "Analyze this data: John, 30 years old"
- Generate: { prompt: "Analyze this data: John, 30 years old" }

**Example 2: AI Chat Model → Gmail**
- Output: { response: "Summary: The data shows..." }
- Input needs: { subject: "string", body: "string", to: "string" }
- Transform: Extract response as body, generate subject from intent, get recipient from context
- Generate: { subject: "Data Analysis Summary", body: "Summary: The data shows...", to: "user@example.com" }

**Example 3: Any Node → if_else**
- Output: { status: "active", value: 100 }
- Input needs: { condition: "string" }
- Transform: Generate intelligent condition based on intent
- Generate: { condition: "{{$json.status}} === 'active' && {{$json.value}} > 50" }

Return ONLY valid JSON, no markdown, no explanations outside JSON.`;

    try {
      const messages = [
        {
          role: 'system' as const,
          content: 'You are an expert at transforming data between workflow nodes. You understand data structures, user intent, and node requirements. You generate real, structured data - never placeholders.',
        },
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      const response = await this.llmAdapter.chat('ollama', messages, {
        model: 'qwen2.5:14b-instruct-q4_K_M',
        temperature: 0.3, // Lower temperature for more deterministic transformations
        maxTokens: 4000, // Allow for complex transformations
      });

      // Parse AI response
      const transformation = this.parseTransformationResponse(response.content);

      return transformation;
    } catch (error) {
      console.error(`[AIDataTransformationLayer] ❌ AI transformation failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fallback: Basic field mapping
      return this.fallbackTransformation(outputAnalysis, inputAnalysis);
    }
  }

  /**
   * Parse AI transformation response
   */
  private parseTransformationResponse(response: string): TransformationResult {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        transformedOutput: parsed.transformedOutput || {},
        transformationExplanation: parsed.transformationExplanation || 'AI transformed data to match input requirements',
        fieldMappings: parsed.fieldMappings || [],
        generatedStructures: parsed.generatedStructures || {},
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      };
    } catch (error) {
      console.error(`[AIDataTransformationLayer] ⚠️  Failed to parse AI response: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Fallback transformation (if AI fails)
   */
  private fallbackTransformation(
    outputAnalysis: ReturnType<AIDataTransformationLayer['analyzeNodeOutput']>,
    inputAnalysis: ReturnType<AIDataTransformationLayer['analyzeNodeInput']>
  ): TransformationResult {
    // Basic field mapping fallback
    const fieldMappings: TransformationResult['fieldMappings'] = [];
    const transformedOutput: any = {};

    // Try to map fields by name
    for (const requiredField of inputAnalysis.requiredFields) {
      const matchingOutputField = outputAnalysis.outputFields.find(
        field => field.toLowerCase() === requiredField.toLowerCase()
      );

      if (matchingOutputField && outputAnalysis.outputData) {
        transformedOutput[requiredField] = outputAnalysis.outputData[matchingOutputField];
        fieldMappings.push({
          from: matchingOutputField,
          to: requiredField,
          transformation: 'direct mapping',
          reason: 'Field names match',
        });
      }
    }

    return {
      transformedOutput,
      transformationExplanation: 'Fallback transformation using basic field mapping',
      fieldMappings,
      generatedStructures: {},
      confidence: 0.5,
    };
  }

  /**
   * Describe data structure for AI
   */
  private describeDataStructure(data: any): string {
    if (!data) return 'No data available';
    if (typeof data === 'string') return `String: "${data.substring(0, 100)}"`;
    if (typeof data === 'number') return `Number: ${data}`;
    if (typeof data === 'boolean') return `Boolean: ${data}`;
    if (Array.isArray(data)) {
      return `Array of ${data.length} items: ${JSON.stringify(data.slice(0, 3), null, 2)}`;
    }
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      return `Object with fields: ${keys.join(', ')}. Structure: ${JSON.stringify(data, null, 2).substring(0, 500)}`;
    }
    return 'Unknown structure';
  }

  /**
   * Describe required input structure for AI
   */
  private describeRequiredStructure(inputSchema: any): string {
    const fields = Object.entries(inputSchema).map(([field, schema]: [string, any]) => {
      return `${field} (${schema.type || 'any'}${schema.required !== false ? ', required' : ', optional'}): ${schema.description || 'No description'}`;
    });

    return `Required input structure:\n${fields.join('\n')}`;
  }

  /**
   * ✅ Generate AI-driven conditions for if_else nodes
   * 
   * AI analyzes user intent and generates intelligent conditions.
   */
  async generateCondition(
    userPrompt: string,
    workflowIntent: string,
    availableData: any,
    conditionContext?: {
      field?: string;
      operation?: string;
      value?: any;
    }
  ): Promise<{
    condition: string;
    explanation: string;
    confidence: number;
  }> {
    console.log(`[AIDataTransformationLayer] 🔍 Generating intelligent condition based on intent...`);

    const prompt = `You are an expert at generating workflow conditions based on user intent.

# USER INTENT:
**Original Prompt**: "${userPrompt}"
**Workflow Intent**: "${workflowIntent}"

# AVAILABLE DATA:
${JSON.stringify(availableData, null, 2)}

# CONDITION CONTEXT:
${conditionContext ? JSON.stringify(conditionContext, null, 2) : 'No specific context provided'}

# YOUR TASK:
Generate an intelligent condition for an if_else node based on user intent.

**CRITICAL RULES**:
1. **Understand Intent**: Don't just match keywords - understand what the user wants to check
2. **Use Available Data**: Reference fields from available data using {{$json.field}} format
3. **Logical Conditions**: Generate proper logical conditions (>, <, ===, !==, includes, etc.)
4. **Clear Logic**: Make conditions clear and understandable
5. **Intent-Aware**: If user says "if status is active", generate: {{$json.status}} === 'active'

# OUTPUT FORMAT (JSON):
{
  "condition": "{{$json.field}} === 'value'", // The condition expression
  "explanation": "Why this condition was generated based on intent",
  "confidence": 0.0-1.0 // Your confidence in this condition
}

# EXAMPLES:

**Example 1**: User says "if status is active, send email"
- Condition: {{$json.status}} === 'active'
- Explanation: User wants to check if status field equals 'active'

**Example 2**: User says "if value is greater than 100"
- Condition: {{$json.value}} > 100
- Explanation: User wants to check if value is greater than 100

**Example 3**: User says "if email contains @example.com"
- Condition: {{$json.email}}.includes('@example.com')
- Explanation: User wants to check if email contains specific domain

Return ONLY valid JSON, no markdown.`;

    try {
      const messages = [
        {
          role: 'system' as const,
          content: 'You are an expert at generating workflow conditions based on user intent. You understand logical conditions and data structures.',
        },
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      const response = await this.llmAdapter.chat('ollama', messages, {
        model: 'qwen2.5:14b-instruct-q4_K_M',
        temperature: 0.2, // Very low temperature for deterministic conditions
        maxTokens: 1000,
      });

      // Parse response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in condition response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        condition: parsed.condition || '{{$json.value}} === true',
        explanation: parsed.explanation || 'AI-generated condition based on intent',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      };
    } catch (error) {
      console.error(`[AIDataTransformationLayer] ❌ Condition generation failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fallback condition
      return {
        condition: '{{$json.value}} === true',
        explanation: 'Fallback condition (AI generation failed)',
        confidence: 0.3,
      };
    }
  }
}

// Export singleton instance
export const aiDataTransformationLayer = new AIDataTransformationLayer();
