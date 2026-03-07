/**
 * SCHEMA-AWARE TEMPLATE GENERATOR
 * 
 * This service generates template expressions ({{$json.field}}) based on ACTUAL
 * upstream node output schemas, not assumptions. This prevents invalid template
 * expressions like {{$json.body}} when the upstream node doesn't output "body".
 * 
 * Architecture:
 * 1. Gets ACTUAL output schema from upstream node
 * 2. Uses LLM to generate semantically correct mappings
 * 3. Returns mappings with confidence scores
 * 4. Only generates templates for fields that actually exist
 * 
 * This replaces naive template generation that creates {{$json.${field}}}
 * without validating that the field exists in upstream outputs.
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { inputFieldMapper, NodeOutputFields } from './input-field-mapper';
import { LLMAdapter } from '../../shared/llm-adapter';
import { getNodeOutputSchema } from '../../core/types/node-output-types';

export interface TemplateMapping {
  targetField: string;           // Field in target node that needs mapping
  sourceField: string;          // Field from upstream node
  template: string;              // Generated template: {{$json.sourceField}}
  confidence: number;            // 0-1 confidence score
  reason: string;                // Why this mapping was chosen
  needsReview?: boolean;         // True if mapping is uncertain
}

export interface TemplateGenerationResult {
  mappings: TemplateMapping[];
  overallConfidence: number;     // Average confidence across all mappings
  notes: string[];               // Important notes or warnings
  upstreamSchema: NodeOutputFields; // The actual schema used
}

/**
 * Generate template mappings using schema-aware LLM generation
 * 
 * @param upstreamNode - The node that provides data
 * @param targetNode - The node that needs data
 * @param structuredIntent - User's intent (what they want to achieve)
 * @param sampleLimit - Maximum number of sample values to include (default: 3)
 * @param llmAdapter - LLM adapter for generating mappings
 * @returns Template generation result with mappings and confidence
 */
export async function generateTemplates({
  upstreamNode,
  targetNode,
  structuredIntent,
  sampleLimit = 3,
  llmAdapter,
}: {
  upstreamNode: WorkflowNode;
  targetNode: WorkflowNode;
  structuredIntent?: string;
  sampleLimit?: number;
  llmAdapter: LLMAdapter;
}): Promise<TemplateGenerationResult> {
  
  // ✅ STEP 1: Get ACTUAL output schema from upstream node
  const upstreamSchema = inputFieldMapper.getNodeOutputFields(upstreamNode);
  
  // ✅ STEP 2: Get target node input requirements
  const targetNodeType = targetNode.data?.type || targetNode.type;
  const targetNodeSchema = getNodeOutputSchema(targetNodeType);
  
  // ✅ STEP 3: Get target node input fields (what it needs)
  const targetInputFields = getTargetInputFields(targetNode);
  
  // ✅ STEP 4: Build deterministic LLM prompt
  const prompt = buildMappingPrompt({
    upstreamSchema,
    targetInputFields,
    targetNodeType,
    structuredIntent,
    sampleLimit,
  });
  
  // ✅ STEP 5: Call LLM to generate mappings
  const messages = [
    { role: 'system' as const, content: prompt.systemPrompt },
    { role: 'user' as const, content: prompt.userPrompt }
  ];
  const llmResponse = await llmAdapter.chat('ollama', messages, {
    model: 'llama3.2',
    temperature: 0.1, // Low temperature for deterministic mappings
  });
  
  // ✅ STEP 6: Parse LLM response
  let parsedResponse: any;
  try {
    const cleanJson = extractJsonFromResponse(llmResponse.content);
    parsedResponse = JSON.parse(cleanJson);
  } catch (error) {
    console.error('[SchemaAwareTemplateGenerator] Failed to parse LLM response:', error);
    return {
      mappings: [],
      overallConfidence: 0,
      notes: [`Failed to parse LLM response: ${error}`],
      upstreamSchema,
    };
  }
  
  // ✅ STEP 7: Validate and normalize mappings
  const mappings = validateAndNormalizeMappings(
    parsedResponse.mappings || [],
    upstreamSchema,
    targetInputFields
  );
  
  // ✅ STEP 8: Calculate overall confidence
  const overallConfidence = calculateOverallConfidence(mappings);
  
  // ✅ STEP 9: Generate notes
  const notes = generateNotes(mappings, upstreamSchema, targetInputFields);
  
  return {
    mappings,
    overallConfidence,
    notes,
    upstreamSchema,
  };
}

/**
 * Build deterministic LLM prompt for template generation
 */
function buildMappingPrompt({
  upstreamSchema,
  targetInputFields,
  targetNodeType,
  structuredIntent,
  sampleLimit,
}: {
  upstreamSchema: NodeOutputFields;
  targetInputFields: string[];
  targetNodeType: string;
  structuredIntent?: string;
  sampleLimit: number;
}): { systemPrompt: string; userPrompt: string } {
  
  const systemPrompt = `You are an expert at mapping data fields between workflow nodes.
Your task is to generate template expressions ({{$json.field}}) that correctly reference
fields from upstream node outputs.

CRITICAL RULES:
1. ONLY use fields that exist in the upstream schema (provided below)
2. NEVER invent fields that don't exist
3. Use semantic matching (e.g., "body" → "content" if that's what exists)
4. Provide confidence scores (0-1) for each mapping
5. Mark mappings as needsReview=true if uncertain
6. Return JSON in this exact format:
{
  "mappings": [
    {
      "targetField": "field_name_in_target",
      "sourceField": "field_name_in_upstream",
      "template": "{{$json.sourceField}}",
      "confidence": 0.95,
      "reason": "exact match",
      "needsReview": false
    }
  ]
}`;

  const upstreamFieldsList = upstreamSchema.outputFields
    .map(field => {
      const fieldInfo: string[] = [field];
      
      // Add type info if available
      if (upstreamSchema.outputSchema?.structure?.fields?.[field]) {
        fieldInfo.push(`(type: ${upstreamSchema.outputSchema.structure.fields[field]})`);
      }
      
      return `  - ${fieldInfo.join(' ')}`;
    })
    .join('\n');

  const userPrompt = `UPSTREAM NODE OUTPUT SCHEMA:
Node Type: ${upstreamSchema.nodeType}
Available Fields:
${upstreamFieldsList}

TARGET NODE REQUIREMENTS:
Node Type: ${targetNodeType}
Required Input Fields:
${targetInputFields.map(f => `  - ${f}`).join('\n')}

${structuredIntent ? `USER INTENT: ${structuredIntent}\n` : ''}

TASK: Generate template mappings for each target field.
- Map each target field to the best matching upstream field
- Use exact matches when possible
- Use semantic matches when exact match not available
- If no match exists, mark needsReview=true
- Generate template expression: {{$json.sourceField}}

Return JSON with mappings array.`;

  return { systemPrompt, userPrompt };
}

/**
 * Get target node input fields (what it needs)
 */
function getTargetInputFields(targetNode: WorkflowNode): string[] {
  const nodeType = targetNode.data?.type || targetNode.type;
  const nodeSchema = require('../nodes/node-library').nodeLibrary.getSchema(nodeType);
  
  const inputFields: string[] = [];
  
  // Get from config schema
  if (nodeSchema?.configSchema?.required) {
    inputFields.push(...Object.keys(nodeSchema.configSchema.required));
  }
  
  if (nodeSchema?.configSchema?.optional) {
    inputFields.push(...Object.keys(nodeSchema.configSchema.optional));
  }
  
  // Get from node config if explicitly set
  if (targetNode.data?.config) {
    const configFields = Object.keys(targetNode.data.config);
    inputFields.push(...configFields.filter(f => !f.startsWith('_')));
  }
  
  return Array.from(new Set(inputFields));
}

/**
 * Extract JSON from LLM response (handles code blocks, etc.)
 */
function extractJsonFromResponse(response: string): string {
  // Try to extract JSON from code blocks
  const codeBlockMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1];
  }
  
  // Try to find JSON object
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  return response.trim();
}

/**
 * Validate and normalize mappings from LLM response
 */
function validateAndNormalizeMappings(
  rawMappings: any[],
  upstreamSchema: NodeOutputFields,
  targetInputFields: string[]
): TemplateMapping[] {
  const validMappings: TemplateMapping[] = [];
  
  for (const raw of rawMappings) {
    // Validate required fields
    if (!raw.targetField || !raw.sourceField) {
      continue;
    }
    
    // ✅ CRITICAL: Validate sourceField exists in upstream schema
    if (!upstreamSchema.outputFields.includes(raw.sourceField)) {
      // Field doesn't exist - mark as needsReview
      validMappings.push({
        targetField: raw.targetField,
        sourceField: raw.sourceField,
        template: `{{$json.${raw.sourceField}}}`,
        confidence: 0,
        reason: `Field "${raw.sourceField}" not found in upstream schema`,
        needsReview: true,
      });
      continue;
    }
    
    // Normalize template format
    let template = raw.template || `{{$json.${raw.sourceField}}}`;
    if (!template.includes('{{')) {
      template = `{{$json.${raw.sourceField}}}`;
    }
    
    // Validate confidence
    const confidence = Math.max(0, Math.min(1, raw.confidence || 0.5));
    
    validMappings.push({
      targetField: raw.targetField,
      sourceField: raw.sourceField,
      template,
      confidence,
      reason: raw.reason || 'LLM-generated mapping',
      needsReview: raw.needsReview || confidence < 0.7,
    });
  }
  
  return validMappings;
}

/**
 * Calculate overall confidence from mappings
 */
function calculateOverallConfidence(mappings: TemplateMapping[]): number {
  if (mappings.length === 0) return 0;
  
  const totalConfidence = mappings.reduce((sum, m) => sum + m.confidence, 0);
  return totalConfidence / mappings.length;
}

/**
 * Generate notes about the mappings
 */
function generateNotes(
  mappings: TemplateMapping[],
  upstreamSchema: NodeOutputFields,
  targetInputFields: string[]
): string[] {
  const notes: string[] = [];
  
  // Check for unmapped target fields
  const mappedTargetFields = new Set(mappings.map(m => m.targetField));
  const unmappedFields = targetInputFields.filter(f => !mappedTargetFields.has(f));
  if (unmappedFields.length > 0) {
    notes.push(`Unmapped target fields: ${unmappedFields.join(', ')}`);
  }
  
  // Check for low confidence mappings
  const lowConfidenceMappings = mappings.filter(m => m.confidence < 0.7);
  if (lowConfidenceMappings.length > 0) {
    notes.push(`${lowConfidenceMappings.length} mappings have low confidence (< 0.7)`);
  }
  
  // Check for needsReview mappings
  const needsReviewMappings = mappings.filter(m => m.needsReview);
  if (needsReviewMappings.length > 0) {
    notes.push(`${needsReviewMappings.length} mappings need manual review`);
  }
  
  // Check for upstream schema completeness
  if (upstreamSchema.outputFields.length === 0) {
    notes.push('Warning: Upstream node has no output fields defined');
  }
  
  return notes;
}
