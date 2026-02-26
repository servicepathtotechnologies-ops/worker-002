/**
 * Layer 4: Property Inference Engine
 * 
 * Multi-step inference that fills node properties automatically.
 * Implements: Context Extraction → Schema Completion → Confidence Scoring
 * 
 * Architecture:
 * Node + Prompt + Context → Extract Context → Complete Schema → Score Confidence → Inference Result
 */

import { ollamaOrchestrator } from './ollama-orchestrator';
import { nodeLibrary } from '../nodes/node-library';
import type { PlanStep } from './planner-engine';
import type { IntentObject } from './intent-engine';

export interface InferenceContext {
  who?: string;      // Who is involved (e.g., "leads", "customers")
  what?: string;      // What action (e.g., "send email", "update record")
  when?: string;      // When it happens (e.g., "daily", "on form submit")
  why?: string;       // Why it's needed (e.g., "follow up", "notify team")
  where?: string;     // Where data comes from/goes to
  how?: string;       // How it should work
}

export interface InferenceResult {
  properties: Record<string, any>;  // Inferred property values
  confidence: number;                // Overall confidence (0.0 - 1.0)
  missingFields: string[];           // Fields that need user input
  inferredFields: string[];          // Fields successfully inferred
  fieldConfidences: Record<string, number>; // Confidence per field
}

/**
 * Property Inference Engine
 * 
 * Multi-step inference process:
 * 1. Context Extraction: Extract who, what, when, why, where, how
 * 2. Schema Completion: Fill node schema with inferred values
 * 3. Confidence Scoring: Score each field and overall confidence
 * 4. Missing Fields: Identify fields that need user input
 */
export class PropertyInferenceEngine {
  private readonly CONFIDENCE_THRESHOLD = 0.7; // Ask user if confidence < 0.7

  /**
   * Infer properties for a node
   * 
   * @param nodeName - Node type (e.g., "google_gmail")
   * @param originalPrompt - User's original prompt
   * @param planStep - Plan step context
   * @param intent - Intent context
   * @param previousStepOutputs - Outputs from previous steps
   * @returns InferenceResult with properties, confidence, and missing fields
   */
  async inferProperties(
    nodeName: string,
    originalPrompt: string,
    planStep?: PlanStep,
    intent?: IntentObject,
    previousStepOutputs?: Record<string, any>
  ): Promise<InferenceResult> {
    if (!nodeName || typeof nodeName !== 'string' || nodeName.trim().length === 0) {
      throw new Error('Node name is required and must be a non-empty string');
    }

    if (!originalPrompt || typeof originalPrompt !== 'string' || originalPrompt.trim().length === 0) {
      throw new Error('Original prompt is required and must be a non-empty string');
    }

    console.log(`[PropertyInferenceEngine] Inferring properties for node: ${nodeName}`);

    try {
      // Step 1: Extract context
      const context = await this.extractContext(originalPrompt, planStep, intent);

      // Step 2: Get node schema
      const nodeSchema = nodeLibrary.getSchema(nodeName);
      if (!nodeSchema) {
        throw new Error(`Node schema not found: ${nodeName}`);
      }

      // Step 3: Complete schema with inferred values
      const inferenceResult = await this.completeSchema(
        nodeSchema,
        context,
        originalPrompt,
        previousStepOutputs
      );

      // Validate result
      if (typeof inferenceResult.confidence !== 'number' || 
          !Array.isArray(inferenceResult.inferredFields) ||
          !Array.isArray(inferenceResult.missingFields)) {
        throw new Error('Invalid inference result structure');
      }

      console.log(`[PropertyInferenceEngine] ✅ Inference complete`);
      console.log(`[PropertyInferenceEngine] Confidence: ${inferenceResult.confidence.toFixed(2)}`);
      console.log(`[PropertyInferenceEngine] Inferred: ${inferenceResult.inferredFields.length} fields`);
      console.log(`[PropertyInferenceEngine] Missing: ${inferenceResult.missingFields.length} fields`);

      return inferenceResult;
    } catch (error) {
      console.error(`[PropertyInferenceEngine] Property inference failed for node "${nodeName}":`, error);
      // Return empty result with low confidence
      return {
        properties: {},
        confidence: 0.0,
        missingFields: nodeLibrary.getSchema(nodeName)?.configSchema?.required || [],
        inferredFields: [],
        fieldConfidences: {},
      };
    }
  }

  /**
   * Step 1: Extract context (who, what, when, why, where, how)
   */
  private async extractContext(
    prompt: string,
    planStep?: PlanStep,
    intent?: IntentObject
  ): Promise<InferenceContext> {
    const contextPrompt = `Extract structured context from the following information:

USER PROMPT: "${prompt}"

${planStep ? `PLAN STEP: ${planStep.action} - ${planStep.reason}` : ''}

${intent ? `GOAL: ${intent.goal}\nENTITIES: ${intent.entities.join(', ')}` : ''}

Extract the following information:
- **who**: Who is involved? (e.g., "leads", "customers", "team members")
- **what**: What action is being performed? (e.g., "send email", "update record")
- **when**: When does this happen? (e.g., "daily", "on form submit", "at 9am")
- **why**: Why is this needed? (e.g., "follow up", "notify team", "save data")
- **where**: Where does data come from/go to? (e.g., "CRM", "Google Sheets", "email")
- **how**: How should it work? (e.g., "automatically", "with confirmation", "in batch")

Return ONLY valid JSON:
{
  "who": "who is involved",
  "what": "what action",
  "when": "when it happens",
  "why": "why it's needed",
  "where": "where data comes from/goes to",
  "how": "how it should work"
}

Return ONLY JSON, no markdown, no code blocks.`;

    try {
      const result = await ollamaOrchestrator.processRequest('workflow-generation', {
        prompt: contextPrompt,
        temperature: 0.2,
        maxTokens: 300,
      });

      const content = typeof result === 'string' ? result : JSON.stringify(result);
      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const context = JSON.parse(cleaned) as InferenceContext;
      return context;
    } catch (error) {
      console.warn('[PropertyInferenceEngine] Context extraction failed, using fallback:', error);
      return this.fallbackContextExtraction(prompt);
    }
  }

  /**
   * Step 2: Complete schema with inferred values
   */
  private async completeSchema(
    nodeSchema: any,
    context: InferenceContext,
    originalPrompt: string,
    previousStepOutputs?: Record<string, any>
  ): Promise<InferenceResult> {
    const requiredFields = nodeSchema.configSchema?.required || [];
    const optionalFields = nodeSchema.configSchema?.optional || {};

    const allFields = [
      ...requiredFields,
      ...Object.keys(optionalFields),
    ];

    const properties: Record<string, any> = {};
    const fieldConfidences: Record<string, number> = {};
    const inferredFields: string[] = [];
    const missingFields: string[] = [];

    // Build inference prompt
    const inferencePrompt = this.buildInferencePrompt(
      nodeSchema,
      context,
      originalPrompt,
      allFields,
      previousStepOutputs
    );

    try {
      const result = await ollamaOrchestrator.processRequest('workflow-generation', {
        prompt: inferencePrompt,
        temperature: 0.2,
        maxTokens: 1000,
      });

      const content = typeof result === 'string' ? result : JSON.stringify(result);
      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const inferred = JSON.parse(cleaned);

      // Process each field
      for (const field of allFields) {
        const fieldValue = inferred[field];
        const fieldInfo = optionalFields[field] || {};

        if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
          // Field was inferred
          properties[field] = fieldValue;
          
          // Score confidence for this field
          const confidence = this.scoreFieldConfidence(
            field,
            fieldValue,
            context,
            originalPrompt,
            fieldInfo
          );
          
          fieldConfidences[field] = confidence;
          inferredFields.push(field);

          // If confidence is low, mark as missing (needs user input)
          if (confidence < this.CONFIDENCE_THRESHOLD) {
            missingFields.push(field);
          }
        } else if (requiredFields.includes(field)) {
          // Required field not inferred
          missingFields.push(field);
        }
      }

      // Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(
        fieldConfidences,
        requiredFields,
        inferredFields
      );

      return {
        properties,
        confidence: overallConfidence,
        missingFields,
        inferredFields,
        fieldConfidences,
      };
    } catch (error) {
      console.error('[PropertyInferenceEngine] Schema completion failed:', error);
      
      // Fallback: mark all required fields as missing
      return {
        properties: {},
        confidence: 0.0,
        missingFields: requiredFields,
        inferredFields: [],
        fieldConfidences: {},
      };
    }
  }

  /**
   * Build inference prompt for schema completion
   */
  private buildInferencePrompt(
    nodeSchema: any,
    context: InferenceContext,
    originalPrompt: string,
    fields: string[],
    previousStepOutputs?: Record<string, any>
  ): string {
    const fieldDescriptions = fields.map(field => {
      const fieldInfo = nodeSchema.configSchema?.optional?.[field] || {};
      return `- ${field}: ${fieldInfo.description || field} (type: ${fieldInfo.type || 'string'})`;
    }).join('\n');

    return `You are an AI that fills in missing properties for a workflow node.

NODE: ${nodeSchema.type}
DESCRIPTION: ${nodeSchema.description}

CONTEXT:
- Who: ${context.who || 'not specified'}
- What: ${context.what || 'not specified'}
- When: ${context.when || 'not specified'}
- Why: ${context.why || 'not specified'}
- Where: ${context.where || 'not specified'}
- How: ${context.how || 'not specified'}

ORIGINAL USER REQUEST: "${originalPrompt}"

${previousStepOutputs ? `PREVIOUS STEP OUTPUTS: ${JSON.stringify(previousStepOutputs)}` : ''}

FIELDS TO INFER:
${fieldDescriptions}

CRITICAL RULES:
- Infer values based on context and original prompt
- Use previous step outputs when available (e.g., if previous step outputs "leads", use that for recipient)
- For email nodes: infer recipient from context (who), subject from what/why, body from context
- For data nodes: infer source/destination from context (where)
- For delay nodes: infer duration from context (when)
- Use realistic defaults, not placeholders
- If you cannot infer a value confidently, omit it (don't guess)

Return ONLY valid JSON with field names as keys:
{
  "field1": "inferred_value1",
  "field2": "inferred_value2",
  ...
}

Return ONLY JSON, no markdown, no code blocks, no explanations.`;
  }

  /**
   * Score confidence for a field
   */
  private scoreFieldConfidence(
    field: string,
    value: any,
    context: InferenceContext,
    originalPrompt: string,
    fieldInfo: any
  ): number {
    let confidence = 0.5; // Base confidence

    // Check if value matches context
    const valueStr = String(value).toLowerCase();
    
    if (context.who && valueStr.includes(context.who.toLowerCase())) {
      confidence += 0.2;
    }
    if (context.what && valueStr.includes(context.what.toLowerCase())) {
      confidence += 0.2;
    }
    if (context.where && valueStr.includes(context.where.toLowerCase())) {
      confidence += 0.1;
    }

    // Check if value is not a placeholder
    const placeholderPatterns = [
      /placeholder/i,
      /example/i,
      /sample/i,
      /your_/i,
      /\[.*\]/i,
      /\{.*\}/i,
    ];

    let isPlaceholder = false;
    for (const pattern of placeholderPatterns) {
      if (pattern.test(valueStr)) {
        isPlaceholder = true;
        break;
      }
    }

    if (isPlaceholder) {
      confidence -= 0.3;
    }

    // Check if value matches field type
    if (fieldInfo.type) {
      const typeMatch = this.checkTypeMatch(value, fieldInfo.type);
      if (typeMatch) {
        confidence += 0.1;
      } else {
        confidence -= 0.2;
      }
    }

    // Normalize to 0.0 - 1.0
    return Math.max(0.0, Math.min(1.0, confidence));
  }

  /**
   * Check if value matches field type
   */
  private checkTypeMatch(value: any, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' || !isNaN(Number(value));
      case 'boolean':
        return typeof value === 'boolean' || value === 'true' || value === 'false';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(
    fieldConfidences: Record<string, number>,
    requiredFields: string[],
    inferredFields: string[]
  ): number {
    if (Object.keys(fieldConfidences).length === 0) {
      return 0.0;
    }

    // Weight required fields more heavily
    let totalConfidence = 0;
    let totalWeight = 0;

    for (const [field, confidence] of Object.entries(fieldConfidences)) {
      const weight = requiredFields.includes(field) ? 2 : 1;
      totalConfidence += confidence * weight;
      totalWeight += weight;
    }

    // Penalize missing required fields
    const missingRequired = requiredFields.filter(f => !inferredFields.includes(f));
    const missingPenalty = missingRequired.length / Math.max(requiredFields.length, 1);

    const baseConfidence = totalWeight > 0 ? totalConfidence / totalWeight : 0;
    return Math.max(0.0, Math.min(1.0, baseConfidence * (1 - missingPenalty * 0.5)));
  }

  /**
   * Fallback context extraction (keyword-based)
   */
  private fallbackContextExtraction(prompt: string): InferenceContext {
    const promptLower = prompt.toLowerCase();
    
    return {
      who: this.extractWho(promptLower),
      what: this.extractWhat(promptLower),
      when: this.extractWhen(promptLower),
      why: this.extractWhy(promptLower),
      where: this.extractWhere(promptLower),
      how: 'automatically',
    };
  }

  private extractWho(prompt: string): string {
    if (prompt.includes('lead')) return 'leads';
    if (prompt.includes('customer')) return 'customers';
    if (prompt.includes('user')) return 'users';
    if (prompt.includes('team')) return 'team members';
    return 'users';
  }

  private extractWhat(prompt: string): string {
    if (prompt.includes('send email')) return 'send email';
    if (prompt.includes('notify')) return 'send notification';
    if (prompt.includes('update')) return 'update record';
    if (prompt.includes('fetch')) return 'fetch data';
    return 'process request';
  }

  private extractWhen(prompt: string): string {
    if (prompt.includes('daily')) return 'daily';
    if (prompt.includes('weekly')) return 'weekly';
    if (prompt.includes('form')) return 'on form submit';
    if (prompt.includes('trigger')) return 'on trigger';
    return 'on demand';
  }

  private extractWhy(prompt: string): string {
    if (prompt.includes('follow up')) return 'follow up';
    if (prompt.includes('notify')) return 'notify team';
    if (prompt.includes('save')) return 'save data';
    return 'automate workflow';
  }

  private extractWhere(prompt: string): string {
    if (prompt.includes('crm')) return 'CRM';
    if (prompt.includes('sheet')) return 'Google Sheets';
    if (prompt.includes('gmail')) return 'Gmail';
    if (prompt.includes('slack')) return 'Slack';
    return 'system';
  }
}

export const propertyInferenceEngine = new PropertyInferenceEngine();
