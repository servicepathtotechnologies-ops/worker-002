/**
 * AI INPUT RESOLVER
 *
 * This is the CORE ARCHITECTURAL COMPONENT that replaces static JSON dropdowns.
 *
 * Contract: Input resolution MUST combine three inputs and MUST filter:
 * (1) User prompt intent – what the user wants the workflow to do.
 * (2) Previous node JSON – actual output from the upstream node (not hardcoded).
 * (3) Node responsibility – from registry: inputSchema and requiredInputs (what this node needs and does).
 * Filter: From the previous JSON, extract only keys/values relevant to user intent and this node's responsibility; do not pass through the entire payload blindly.
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

const PREVIOUS_OUTPUT_PREVIEW_BUDGET = 2000;
const MAX_ARRAY_SAMPLE_ITEMS = 8;

function truncateText(value: string, max = PREVIOUS_OUTPUT_PREVIEW_BUDGET): string {
  return value.length > max ? `${value.slice(0, max)}... [truncated]` : value;
}

function compactValueForPrompt(value: any, depth = 0): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncateText(value, 500);
  if (typeof value !== 'object') return value;
  if (depth >= 3) {
    if (Array.isArray(value)) return { type: 'array', length: value.length };
    return { type: 'object', keys: Object.keys(value).slice(0, 20) };
  }

  if (Array.isArray(value)) {
    const sample = value.slice(0, MAX_ARRAY_SAMPLE_ITEMS).map((item) => compactValueForPrompt(item, depth + 1));
    const objectItems = value.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
    const fieldNames = Array.from(
      new Set(objectItems.flatMap((item) => Object.keys(item as Record<string, unknown>)))
    ).slice(0, 40);
    return {
      type: 'array',
      count: value.length,
      fieldNames,
      sample,
      truncated: value.length > sample.length,
    };
  }

  const out: Record<string, any> = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    out[key] = compactValueForPrompt(item, depth + 1);
  }
  const keys = Object.keys(value);
  if (keys.length > 30) {
    out.__truncatedKeys = keys.length - 30;
  }
  return out;
}

export function compactForAiPrompt(value: any, max = PREVIOUS_OUTPUT_PREVIEW_BUDGET): string {
  if (value === undefined) return 'No previous output available';
  try {
    return truncateText(JSON.stringify(compactValueForPrompt(value), null, 2), max);
  } catch {
    return truncateText(String(value), max);
  }
}

export interface InputResolutionContext {
  /** (2) Previous node JSON – actual output from upstream node. */
  previousOutput?: any;
  /** (3) Node responsibility – target node's input schema from registry. */
  nodeInputSchema: NodeInputSchema;
  /** (1) User prompt intent – from currentWorkflowIntent set at execution start. */
  userIntent: string;
  nodeType: string;
  nodeLabel?: string;
  workflowContext?: {
    nodes: Array<{ type: string; label: string }>;
    edges: Array<{ source: string; target: string }>;
  };
  /** When set, this is a retry after validation failure; prompt will include required fields that must be present. */
  retryRequiredFields?: string[];
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
    const MAX_ATTEMPTS = 2;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const { nodeInputSchema, nodeType, nodeLabel } = context;
        const mode = this.determineResolutionMode(nodeInputSchema, nodeType, context.previousOutput);

        const retryContext: InputResolutionContext =
          attempt > 0
            ? {
                ...context,
                retryRequiredFields: Object.keys(nodeInputSchema).filter(
                  (k) => nodeInputSchema[k].required !== false
                ),
              }
            : context;

        const prompt = this.buildResolutionPrompt(retryContext, mode);
        const aiResponse = await this.callAIForInputResolution(prompt, mode, nodeInputSchema);
        const validatedInput = this.validateAndNormalize(aiResponse, nodeInputSchema, mode);

        return {
          mode,
          value: validatedInput,
          explanation: `AI-generated input for ${nodeLabel || nodeType} (attempt ${attempt + 1})`,
        };
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[AIInputResolver] Attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: ${err.message}`
        );
      }
    }
    throw lastError;
  }
  
  /**
   * Determine resolution mode from node input schema only (no node-type hardcoding).
   * Universal: message vs json is derived from schema field names and types, not from node type.
   */
  private determineResolutionMode(
    inputSchema: NodeInputSchema,
    _nodeType: string,
    previousOutput?: any
  ): 'message' | 'message+json' | 'json' {
    const schemaFields = Object.keys(inputSchema);
    const fieldTypes = schemaFields.map(field => inputSchema[field].type);

    // If schema has BOTH a title/subject-like field AND a body/message-like field,
    // always use json mode so both fields are filled independently with correct values.
    // message mode can only populate a single primary field, causing the other to stay empty.
    const hasTitleLikeField = schemaFields.some(field => {
      const fl = field.toLowerCase();
      return fl === 'subject' || fl === 'title' || fl === 'headline' || fl === 'name';
    });
    const hasBodyLikeField = schemaFields.some(field => {
      const fl = field.toLowerCase();
      return fl.includes('body') || fl.includes('message') || fl.includes('content') || fl.includes('text');
    });
    if (hasTitleLikeField && hasBodyLikeField) {
      return 'json';
    }

    const hasMessageField = hasBodyLikeField || schemaFields.some(field => {
      const fl = field.toLowerCase();
      return fl.includes('message') || fl.includes('text') || fl.includes('content') || fl.includes('body');
    });

    const hasStructuredFields = fieldTypes.some(type =>
      type === 'object' || type === 'array' || type === 'json'
    );

    if (hasMessageField && hasStructuredFields && previousOutput && typeof previousOutput === 'object' && !Array.isArray(previousOutput)) {
      return 'message+json';
    }
    if (hasMessageField) {
      return 'message';
    }
    return 'json';
  }
  
  /**
   * Build AI prompt for input resolution
   */
  private buildResolutionPrompt(
    context: InputResolutionContext,
    mode: 'message' | 'message+json' | 'json'
  ): string {
    const { previousOutput, nodeInputSchema, userIntent, nodeType, nodeLabel, workflowContext } = context;
    
    const previousOutputStr = compactForAiPrompt(previousOutput);
    
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
- Using the user intent and the target node's input schema (its responsibility), determine which keys and values from the previous output are relevant.
- Do NOT pass through the entire previous output. SELECT only the keys that are needed for this node's input schema and that are relevant to the user intent.
- Map those selected keys/values to the target node's input schema field names. Your output must be a filtered subset: only what this node needs for the user's intent.
- No text message needed, just the mapped JSON object.
- If the schema defines multiple string fields (e.g. subject and body, title and content), you MUST include every such field in your JSON object. Do not omit subject/title lines: derive a short subject or title from user intent or from the first line of the main body text when the previous output has no explicit subject.`;
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

    const schemaKeys = Object.keys(nodeInputSchema || {});
    const hasBodyField = schemaKeys.some((k) => k.toLowerCase() === 'body');
    const hasSubjectField = schemaKeys.some((k) => k.toLowerCase() === 'subject');
    const hasTextContentField = schemaKeys.some((k) => {
      const fl = k.toLowerCase();
      return (
        fl.includes('text') ||
        fl.includes('content') ||
        fl.includes('prompt') ||
        fl.includes('message') ||
        fl.includes('body') ||
        fl.includes('input') ||
        fl.includes('summary')
      );
    });

    // Detect whether upstream is tabular / structured data (Google Sheets, DB query, CSV, etc.)
    // Unwrap array upstreams (e.g. Google Sheets returns [{rows:[...], headers:[...]}])
    const upstreamObj =
      Array.isArray(previousOutput) &&
      previousOutput.length > 0 &&
      typeof previousOutput[0] === 'object'
        ? previousOutput[0]
        : previousOutput;

    const isTabularUpstream =
      upstreamObj !== null &&
      upstreamObj !== undefined &&
      typeof upstreamObj === 'object' &&
      !Array.isArray(upstreamObj) &&
      (
        'rows' in (upstreamObj as object) ||
        'count' in (upstreamObj as object) ||
        'headers' in (upstreamObj as object) ||
        'items' in (upstreamObj as object) ||
        'records' in (upstreamObj as object)
      );

    if (hasBodyField && hasSubjectField) {
      const tabularInstruction = isTabularUpstream ? `
STRUCTURED / TABULAR DATA UPSTREAM — you MUST write a real analysis, not a template:
- The previous output contains tabular data (rows of records with field names and values).
- You have been given a sample of those rows. Use the actual field names and values you see.
- Your "body" MUST contain SPECIFIC numbers and findings derived from that data sample, for example:
    • Number of records / rows seen
    • Field names / columns present
    • Breakdown by a categorical field (e.g. Region: East / West, Category: Cookies / Bars / Snacks)
    • Top items by a numeric field (e.g. highest TotalPrice, highest Qty)
    • Sum or average of a numeric field across the sample
    • Date range if a date field is present
- Do NOT write generic sentences like "This email contains a summary of the data".
- ABSOLUTELY FORBIDDEN: bracket placeholders such as [Insert data here], [Summary goes here], [Add analysis], or any [... here] pattern. If you cannot compute an exact total from a sample, state approximate insights or describe what you see.` : `
- If the previous output has a "response" field containing a string, use that as the body. If the previous output is itself a string, use it directly.`;

      specialInstructions += `

DELIVERABLE CONTENT (email / message nodes — schema has subject + body):
- "subject" MUST be a short subject line (under 100 characters). Derive it from the user intent or the first phrase of the content — not a full paragraph.
- "body" MUST be substantive, ready-to-send email text. NEVER output instructions, configurations, or bracket placeholders like [Insert X here].
- Do NOT output sentences like "The node has been configured to send" or "Please provide recipients".${tabularInstruction}`;
    } else if (isTabularUpstream && hasTextContentField) {
      specialInstructions += `

TABULAR DATA UPSTREAM — write real analysis, not a template:
- The previous output contains tabular data (rows of records). Use the actual field names and values shown in "Previous Node Output" above.
- Your response for the text/content field MUST contain SPECIFIC findings: row count, column names, category breakdowns, top values by numeric field, date ranges, etc.
- ABSOLUTELY FORBIDDEN: bracket placeholders [Insert here], template references {{...}}, or generic sentences like "the data shows records".
- The text you produce will be used directly as input to this node. Make it concrete, specific, and ready-to-use.`;
    }

    const aliasHints: string[] = [];
    for (const [k, def] of Object.entries(nodeInputSchema || {})) {
      const ao = (def as { aliasOf?: string })?.aliasOf;
      if (typeof ao === 'string' && ao.length > 0) {
        aliasHints.push(
          `Field "${ao}" is canonical; "${k}" duplicates the same value. In JSON mode you MUST set "${ao}" when delivering the main text.`
        );
      }
    }
    if (aliasHints.length > 0) {
      specialInstructions += `

ALIAS / DUPLICATE MESSAGE FIELDS (schema-defined):
${aliasHints.map((h) => `- ${h}`).join('\n')}`;
    }
    
    return `You are an AI Input Resolver for a workflow automation system.

FILTER RULE: Using the user intent and the target node's input schema (its responsibility), determine which keys and values from the previous output are relevant. Your output must contain only those: a filtered subset that matches the node's responsibility and the user's intent. Do not blindly forward all keys from the previous output.

TASK: Analyze the KEY NAMES and values in the previous node's output, then produce a JSON object that maps to the CURRENT node's required input fields. This ensures the present node gets the right values in its input fields regardless of what keys the previous node used.

KEY ANALYSIS (critical):
- The previous node output may have ANY key names: e.g. number, value, num, number.1, number.2, number.list, inputData, age, userAge, etc.
- You MUST analyze the actual keys and values in the previous output.
- Map from whatever key holds the relevant data to the target node's input schema field names.
- Example: if the target node needs a field "number" and the previous output has "value" or "number.1" or "num", use that value for "number".
- Produce a JSON object whose keys are the TARGET node's input schema field names and whose values come from the previous output (with key mapping as needed).

CONTEXT:
- Target Node: ${nodeLabel || nodeType}
- User Intent: "${userIntent}"
- Previous Node Output (analyze its keys and values):
${previousOutputStr}

TARGET NODE INPUT SCHEMA (your output keys must match these field names):
${schemaStr}

${modeInstructions}
${specialInstructions}

${context.retryRequiredFields?.length ? `
RETRY (previous response was invalid): The following required fields MUST be present with correct types: ${context.retryRequiredFields.join(', ')}. Return only a JSON object that satisfies the target schema using values from the previous output. Do not omit any of these fields.
` : ''}

REQUIREMENTS:
1. Analyze the KEY NAMES in the previous output (they can be anything: number, value, number.1, number.list, etc.).
2. Map those keys/values to the target node's input schema field names.
3. Produce the JSON that the present node requires so its input fields get the correct values and no errors occur.
4. Format according to the resolution mode above.

OUTPUT FORMAT:
${this.getOutputFormatInstructions(mode)}

IMPORTANT:
- Do NOT include explanations or markdown
- Output ONLY the resolved input value (JSON or text per mode)
- Ensure the output matches the target schema exactly
- If previous output is empty/null, generate appropriate default based on intent
- NEVER output template references like {{$json.field}}, {{...}}, or any handlebars/mustache syntax — embed the ACTUAL VALUES from the previous output data shown above directly into your response
- If you want to reference upstream data, read its value from the "Previous Node Output" section above and include that value literally in your output`;
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
   * Call AI to generate input.
   * When the LLM provider supports structured output / response schema (e.g. Gemini JSON schema),
   * pass inputSchema for mode === 'json' to constrain the model output to the node's input schema.
   */
  private async callAIForInputResolution(
    prompt: string,
    mode: 'message' | 'message+json' | 'json',
    _inputSchema?: NodeInputSchema
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
      // TODO: when llmAdapter supports responseSchema/structuredOutput, pass _inputSchema for mode === 'json' to enforce schema
      const response = await this.llmAdapter.chat('gemini', messages, {
        model: 'gemini-2.5-pro',
        apiKey: process.env.GEMINI_API_KEY,
        temperature: 0.3,
        maxTokens: Number.parseInt(process.env.WORKFLOW_RUNTIME_AI_MAX_OUTPUT_TOKENS || '2000', 10) || 2000,
        usageStage: 'runtime_input_resolution',
      });
      
      // Parse response based on mode
      if (mode === 'message') {
        let content = response.content.trim();

        // Strip markdown code blocks the LLM sometimes wraps output in
        if (content.startsWith('```')) {
          content = content
            .replace(/^```(?:json|text|markdown)?\n?/i, '')
            .replace(/\n?```\s*$/i, '')
            .trim();
        }

        // If LLM returned a JSON object despite being in message mode, extract the text field
        if (content.startsWith('{')) {
          try {
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === 'object') {
              const textFields = ['text', 'message', 'content', 'body', 'prompt', 'response', 'summary'];
              for (const field of textFields) {
                if (
                  typeof parsed[field] === 'string' &&
                  parsed[field].trim() &&
                  !parsed[field].includes('{{')
                ) {
                  return parsed[field];
                }
              }
            }
          } catch {
            // Not JSON — continue with the raw content
          }
        }

        // If value still contains {{...}} template references, throw to trigger retry
        if (content.includes('{{')) {
          throw new Error(
            `[AIInputResolver] LLM returned a template reference instead of actual content. Retrying. Preview: ${content.substring(0, 120)}`
          );
        }

        return content;
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
      const normalized = this.normalizeToSchema(aiResponse, inputSchema);
      return this.enforceMinimumAcceptance(normalized, inputSchema);
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
        return this.enforceMinimumAcceptance(aiResponse, inputSchema);
      }
      
      // If AI returned just a message, wrap it
      return this.enforceMinimumAcceptance({
        message: typeof aiResponse === 'string' ? aiResponse : String(aiResponse),
        data: {},
      }, inputSchema);
    }
    
    return this.enforceMinimumAcceptance(aiResponse, inputSchema);
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

    // Registry role / semantics: fill empty long_body or primary message fields from common synonym keys
    const synonymKeys = ['message', 'body', 'content', 'text', 'summary', 'msg', 'narrative'];
    const narrative = this.pickFirstNonEmptyString(response, synonymKeys);
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      const cur = normalized[fieldName];
      const hasValue =
        cur !== undefined &&
        cur !== null &&
        !(typeof cur === 'string' && cur.trim() === '');
      if (hasValue) continue;
      const role = (fieldDef as { role?: string }).role;
      const fl = fieldName.toLowerCase();
      const wantsNarrative =
        role === 'long_body' ||
        role === 'content' ||
        role === 'short_summary' ||
        fl.includes('message') ||
        fl.includes('body') ||
        (fl.includes('text') && !fl.includes('context'));
      if (wantsNarrative && narrative) {
        normalized[fieldName] = narrative;
      }
    }
    
    return normalized;
  }

  private isPlaceholderLikeString(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const t = value.trim().toLowerCase();
    if (!t) return true;
    // Only treat as placeholder when the string is SHORT — long strings likely contain
    // real content (e.g. AI-generated text from structured data) even if they mention
    // workflow-like phrases incidentally.
    if (t.length > 120) return false;
    return (
      t.includes('process the workflow') ||
      t.includes('configured nodes') ||
      t.includes('placeholder') ||
      t === 'generated message'
    );
  }

  /**
   * Universal minimum acceptance checks for AI-mapped input:
   * - required field presence
   * - basic type compatibility
   * - no placeholder-like values for content fields
   */
  private enforceMinimumAcceptance(candidate: any, schema: NodeInputSchema): any {
    if (candidate == null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return candidate;
    }
    const out = { ...(candidate as Record<string, unknown>) };
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      const value = out[fieldName];
      const expectedType = (fieldDef.type || 'string') as string;
      const required = !!fieldDef.required;

      if (required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
        if (fieldDef.default !== undefined) out[fieldName] = fieldDef.default as unknown;
      }

      const next = out[fieldName];
      if (next !== undefined && next !== null) {
        if (expectedType === 'string' && typeof next !== 'string') out[fieldName] = String(next);
        if (expectedType === 'number' && typeof next !== 'number') {
          const parsed = Number(next);
          if (!Number.isNaN(parsed)) out[fieldName] = parsed;
        }
        if (expectedType === 'boolean' && typeof next !== 'boolean') {
          if (String(next).toLowerCase() === 'true') out[fieldName] = true;
          if (String(next).toLowerCase() === 'false') out[fieldName] = false;
        }
      }

      const role = (fieldDef as any).role as string | undefined;
      const isContentField =
        role === 'content' ||
        role === 'long_body' ||
        role === 'prompt' ||
        fieldName.toLowerCase().includes('text') ||
        fieldName.toLowerCase().includes('message') ||
        fieldName.toLowerCase().includes('body');
      if (isContentField && this.isPlaceholderLikeString(out[fieldName])) {
        if (typeof fieldDef.default === 'string' && fieldDef.default.trim().length > 0) {
          out[fieldName] = fieldDef.default;
        } else {
          out[fieldName] = '';
        }
      }
    }
    return out;
  }

  private pickFirstNonEmptyString(obj: Record<string, unknown>, keys: string[]): string | undefined {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.trim().length > 80) return v;
    }
    return undefined;
  }
}

// Export singleton instance
export const aiInputResolver = new AIInputResolver();
