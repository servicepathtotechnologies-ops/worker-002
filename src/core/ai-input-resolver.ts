/**
 * AI INPUT RESOLVER
 * 
 * This is the CORE ARCHITECTURAL COMPONENT that replaces static JSON dropdowns.
 * 
 * Architecture:
 * - Dynamically generates node inputs using AI
 * - Analyzes previous node outputs
 * - Understands user intent
 * - Formats inputs according to node inputSchema
 * 
 * This ensures:
 * - NO manual JSON dropdowns
 * - NO static field mapping
 * - AI-driven input generation for ALL nodes
 * - Universal runtime behavior
 */

import { NodeInputSchema } from './types/unified-node-contract';
import { LLMAdapter } from '../shared/llm-adapter';

export interface InputResolutionContext {
  previousOutput?: any; // Output from previous node
  nodeInputSchema: NodeInputSchema; // Target node's input schema
  userIntent: string; // Original user prompt
  nodeType: string; // Target node type
  nodeLabel?: string; // Human-readable node label
  workflowContext?: {
    nodes: Array<{ type: string; label: string }>;
    edges: Array<{ source: string; target: string }>;
  };
}

export interface ResolvedInput {
  mode: 'message' | 'message+json' | 'json';
  value: any; // Resolved input value
  explanation?: string; // Why this input was generated
}

/**
 * AI Input Resolver Service
 * 
 * Determines the correct input format for a node based on:
 * 1. Previous node output structure
 * 2. Target node input schema
 * 3. User intent
 * 4. Node type requirements
 */
export class AIInputResolver {
  private llmAdapter: LLMAdapter;
  
  constructor() {
    this.llmAdapter = new LLMAdapter();
  }
  
  /**
   * Resolve input for a node using AI
   * 
   * This replaces all static JSON dropdown logic.
   * AI analyzes context and generates appropriate input.
   */
  async resolveInput(context: InputResolutionContext): Promise<ResolvedInput> {
    const { previousOutput, nodeInputSchema, userIntent, nodeType, nodeLabel } = context;
    
    // Step 1: Determine resolution mode based on node input schema
    const mode = this.determineResolutionMode(nodeInputSchema, nodeType, previousOutput);
    
    // Step 2: Build AI prompt for input resolution
    const prompt = this.buildResolutionPrompt(context, mode);
    
    // Step 3: Call AI to generate input
    const aiResponse = await this.callAIForInputResolution(prompt, mode);
    
    // Step 4: Validate and normalize AI response against schema
    const validatedInput = this.validateAndNormalize(aiResponse, nodeInputSchema, mode);
    
    return {
      mode,
      value: validatedInput,
      explanation: `AI-generated input for ${nodeLabel || nodeType} based on previous output and user intent`,
    };
  }
  
  /**
   * Determine resolution mode based on node input schema
   */
  private previousOutput: any; // Store previous output for mode determination
  
  private determineResolutionMode(
    inputSchema: NodeInputSchema,
    nodeType: string,
    previousOutput?: any
  ): 'message' | 'message+json' | 'json' {
    const schemaFields = Object.keys(inputSchema);
    const fieldTypes = schemaFields.map(field => inputSchema[field].type);
    
    // Communication nodes (Gmail, Slack, etc.) typically need message
    if (nodeType.includes('gmail') || nodeType.includes('email') || 
        nodeType.includes('slack') || nodeType.includes('discord')) {
      // Check if they also need structured data
      const hasStructuredFields = fieldTypes.some(type => 
        type === 'object' || type === 'array' || type === 'json'
      );
      
      if (hasStructuredFields && previousOutput) {
        return 'message+json';
      }
      return 'message';
    }
    
    // API/Data nodes typically need structured JSON
    // ✅ CRITICAL: Explicitly handle HTTP Request nodes
    if (nodeType === 'http_request' || nodeType.includes('http_request') || 
        nodeType.includes('api') || nodeType.includes('database') || 
        nodeType.includes('sheets') || nodeType.includes('airtable')) {
      return 'json';
    }
    
    // AI nodes can accept either
    if (nodeType.includes('ai') || nodeType.includes('llm') || nodeType.includes('chat')) {
      // If previous output is structured, use message+json
      if (previousOutput && typeof previousOutput === 'object' && !Array.isArray(previousOutput)) {
        return 'message+json';
      }
      return 'message';
    }
    
    // Default: analyze schema to determine
    const hasMessageField = schemaFields.some(field => 
      field.toLowerCase().includes('message') || 
      field.toLowerCase().includes('text') ||
      field.toLowerCase().includes('content') ||
      field.toLowerCase().includes('body')
    );
    
    const hasStructuredFields = fieldTypes.some(type => 
      type === 'object' || type === 'array' || type === 'json'
    );
    
    if (hasMessageField && hasStructuredFields) {
      return 'message+json';
    } else if (hasMessageField) {
      return 'message';
    } else {
      return 'json';
    }
  }
  
  /**
   * Build AI prompt for input resolution
   */
  private buildResolutionPrompt(
    context: InputResolutionContext,
    mode: 'message' | 'message+json' | 'json'
  ): string {
    const { previousOutput, nodeInputSchema, userIntent, nodeType, nodeLabel, workflowContext } = context;
    
    const previousOutputStr = previousOutput 
      ? JSON.stringify(previousOutput, null, 2).substring(0, 2000) // Limit size
      : 'No previous output available';
    
    const schemaStr = JSON.stringify(nodeInputSchema, null, 2);
    
    let modeInstructions = '';
    switch (mode) {
      case 'message':
        modeInstructions = `
MODE: Generate ONLY a text message.
- Create a clear, professional message
- No JSON structure needed
- Just plain text content`;
        break;
      case 'message+json':
        modeInstructions = `
MODE: Generate a message PLUS structured JSON data.
- Create a text message (for communication)
- Extract and format relevant data from previous output as JSON
- Format: { "message": "...", "data": {...} }`;
        break;
      case 'json':
        modeInstructions = `
MODE: Generate ONLY structured JSON data.
- Extract relevant fields from previous output
- Format according to target node input schema
- No text message needed, just structured data`;
        break;
    }
    
    // ✅ CRITICAL: Special handling for HTTP Request nodes
    let specialInstructions = '';
    if (nodeType === 'http_request' || nodeType.includes('http_request')) {
      specialInstructions = `
SPECIAL INSTRUCTIONS FOR HTTP REQUEST NODE:
- The "body" field should contain the data to send in the POST/PUT/PATCH request
- Extract relevant data from previous output and format as JSON object
- If previous output has a "response" field (from AI Chat Model), use that as the body
- If previous output has structured data, format it appropriately for the API
- The "headers" field should include Content-Type: application/json if body is present
- Example: If previous output is {"response": "Hello"}, body should be {"message": "Hello"} or {"text": "Hello"} depending on API needs`;
    }
    
    return `You are an AI Input Resolver for a workflow automation system.

TASK: Generate the correct input for a node based on previous output and user intent.

CONTEXT:
- Target Node: ${nodeLabel || nodeType}
- User Intent: "${userIntent}"
- Previous Node Output:
${previousOutputStr}

TARGET NODE INPUT SCHEMA:
${schemaStr}

${modeInstructions}
${specialInstructions}

REQUIREMENTS:
1. Analyze the previous output structure
2. Understand what the user wants to achieve (from intent)
3. Generate input that matches the target node's input schema
4. Extract only relevant data from previous output
5. Format according to the resolution mode above

OUTPUT FORMAT:
${this.getOutputFormatInstructions(mode)}

IMPORTANT:
- Do NOT include explanations or markdown
- Output ONLY the resolved input value
- Ensure the output matches the target schema exactly
- If previous output is empty/null, generate appropriate default based on intent`;
  }
  
  /**
   * Get output format instructions based on mode
   */
  private getOutputFormatInstructions(mode: 'message' | 'message+json' | 'json'): string {
    switch (mode) {
      case 'message':
        return 'Output a plain text string (no JSON, no quotes, just the message content)';
      case 'message+json':
        return `Output valid JSON in this format:
{
  "message": "text message here",
  "data": { ... structured data from previous output ... }
}`;
      case 'json':
        return 'Output valid JSON object matching the target node input schema';
    }
  }
  
  /**
   * Call AI to generate input
   */
  private async callAIForInputResolution(
    prompt: string,
    mode: 'message' | 'message+json' | 'json'
  ): Promise<any> {
    try {
      const messages = [
        {
          role: 'system' as const,
          content: 'You are an expert at analyzing workflow data and generating appropriate inputs for automation nodes. You understand data structures, user intent, and node requirements.',
        },
        {
          role: 'user' as const,
          content: prompt,
        },
      ];
      
      const response = await this.llmAdapter.chat('ollama', messages, {
        model: 'qwen2.5:14b-instruct-q4_K_M',
        temperature: 0.3, // Lower temperature for more deterministic output
      });
      
      // Parse response based on mode
      if (mode === 'message') {
        // Plain text - return as-is
        return response.content.trim();
      } else {
        // JSON mode - parse JSON
        try {
          // Try to extract JSON from response (might have markdown code blocks)
          let jsonStr = response.content.trim();
          
          // Remove markdown code blocks if present
          if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
          }
          
          return JSON.parse(jsonStr);
        } catch (parseError) {
          // If JSON parse fails, try to extract JSON object from text
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          
          throw new Error(`Failed to parse AI response as JSON: ${response.content}`);
        }
      }
    } catch (error: any) {
      console.error('[AIInputResolver] ❌ AI resolution failed:', error);
      throw new Error(`AI input resolution failed: ${error.message}`);
    }
  }
  
  /**
   * Validate and normalize AI response against node input schema
   */
  private validateAndNormalize(
    aiResponse: any,
    inputSchema: NodeInputSchema,
    mode: 'message' | 'message+json' | 'json'
  ): any {
    // If mode is 'message', validate it's a string
    if (mode === 'message') {
      if (typeof aiResponse !== 'string') {
        return String(aiResponse);
      }
      return aiResponse;
    }
    
    // For JSON modes, validate against schema
    if (mode === 'json') {
      return this.normalizeToSchema(aiResponse, inputSchema);
    }
    
    // For message+json, validate structure
    if (mode === 'message+json') {
      if (typeof aiResponse === 'object' && aiResponse !== null) {
        // Ensure it has message and data fields
        if (!aiResponse.message) {
          aiResponse.message = 'Generated message';
        }
        if (!aiResponse.data) {
          aiResponse.data = {};
        }
        return aiResponse;
      }
      
      // If AI returned just a message, wrap it
      return {
        message: typeof aiResponse === 'string' ? aiResponse : String(aiResponse),
        data: {},
      };
    }
    
    return aiResponse;
  }
  
  /**
   * Normalize response to match input schema
   */
  private normalizeToSchema(response: any, schema: NodeInputSchema): any {
    if (typeof response !== 'object' || response === null) {
      // If response is not an object, try to create one from schema
      const normalized: Record<string, any> = {};
      for (const [fieldName, fieldDef] of Object.entries(schema)) {
        if (fieldDef.default !== undefined) {
          normalized[fieldName] = fieldDef.default;
        }
      }
      return normalized;
    }
    
    // Map response fields to schema fields
    const normalized: Record<string, any> = {};
    
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      // Try to find matching field in response (case-insensitive, partial match)
      const matchingKey = Object.keys(response).find(key => 
        key.toLowerCase() === fieldName.toLowerCase() ||
        key.toLowerCase().includes(fieldName.toLowerCase()) ||
        fieldName.toLowerCase().includes(key.toLowerCase())
      );
      
      if (matchingKey !== undefined) {
        normalized[fieldName] = response[matchingKey];
      } else if (fieldDef.default !== undefined) {
        normalized[fieldName] = fieldDef.default;
      }
    }
    
    return normalized;
  }
}

// Export singleton instance
export const aiInputResolver = new AIInputResolver();
