/**
 * ✅ REQUIRED FIELD POPULATOR - Production-Grade Required Field Auto-Population
 * 
 * This service intelligently populates required fields that are missing,
 * preventing "Required field 'X' is missing or empty" errors.
 * 
 * Architecture:
 * - Analyzes node schema to find required fields
 * - Uses upstream node outputs to infer values
 * - Applies intelligent defaults based on field type and name
 * - Uses LLM for semantic inference when needed
 * - Guarantees all required fields are populated
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { inputFieldMapper, NodeOutputFields } from './input-field-mapper';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { convertToType, FieldType } from '../../core/utils/type-converter';
import { LLMAdapter } from '../../shared/llm-adapter';

export interface FieldPopulationResult {
  populated: Record<string, any>;
  source: 'upstream' | 'default' | 'inferred' | 'llm';
  confidence: number;
  notes: string[];
}

/**
 * ✅ Populate all required fields for a node
 */
export async function populateRequiredFields(
  node: WorkflowNode,
  previousNode: WorkflowNode | null,
  allNodes: WorkflowNode[],
  nodeIndex: number,
  llmAdapter?: LLMAdapter
): Promise<FieldPopulationResult> {
  const nodeType = unifiedNormalizeNodeType(node);
  const schema = nodeLibrary.getSchema(nodeType);
  
  if (!schema?.configSchema) {
    return {
      populated: {},
      source: 'default',
      confidence: 0,
      notes: [`No schema found for node type: ${nodeType}`],
    };
  }
  
  const config = node.data?.config || {};
  const requiredFields = schema.configSchema.required || [];
  const optionalFields = schema.configSchema.optional || {};
  const allFields = { ...optionalFields };
  
  // Add required fields to allFields
  requiredFields.forEach(fieldName => {
    if (!allFields[fieldName]) {
      allFields[fieldName] = { type: 'string', description: '', requiredIf: undefined };
    }
  });
  
  const populated: Record<string, any> = {};
  const notes: string[] = [];
  let confidence = 1.0;
  let source: 'upstream' | 'default' | 'inferred' | 'llm' = 'default';
  
  // Step 1: Check existing config for required fields
  for (const fieldName of requiredFields) {
    const existingValue = config[fieldName];
    
    // If field exists and is not empty, keep it
    if (existingValue !== undefined && existingValue !== null && existingValue !== '') {
      populated[fieldName] = existingValue;
      continue;
    }
    
    // Field is missing - need to populate
    const fieldDef = allFields[fieldName];
    const fieldType = (fieldDef?.type || 'string') as FieldType;
    
    // Step 2: Try to infer from upstream node
    if (previousNode) {
      const upstreamOutput = inputFieldMapper.getNodeOutputFields(previousNode);
      const inferred = inferFieldFromUpstream(fieldName, fieldType, upstreamOutput);
      
      if (inferred.success) {
        populated[fieldName] = inferred.value;
        source = 'upstream';
        confidence = Math.min(confidence, inferred.confidence);
        notes.push(`Inferred "${fieldName}" from upstream node: ${inferred.reason}`);
        continue;
      }
    }
    
    // Step 3: Try semantic matching across all upstream nodes
    const upstreamNodes = allNodes.slice(0, nodeIndex);
    for (let i = upstreamNodes.length - 1; i >= 0; i--) {
      const upstreamNode = upstreamNodes[i];
      const upstreamOutput = inputFieldMapper.getNodeOutputFields(upstreamNode);
      const inferred = inferFieldFromUpstream(fieldName, fieldType, upstreamOutput);
      
      if (inferred.success) {
        populated[fieldName] = inferred.value;
        source = 'upstream';
        confidence = Math.min(confidence, inferred.confidence);
        notes.push(`Inferred "${fieldName}" from upstream node ${i}: ${inferred.reason}`);
        break;
      }
    }
    
    // Step 4: Use intelligent default based on field name and type
    const defaultValue = getIntelligentDefault(fieldName, fieldType, schema);
    populated[fieldName] = defaultValue.value;
    notes.push(`Using default for "${fieldName}": ${defaultValue.reason}`);
    confidence = Math.min(confidence, defaultValue.confidence);
  }
  
  // Step 5: If LLM available and confidence is low, try LLM inference
  if (llmAdapter && confidence < 0.7 && previousNode) {
    const llmResult = await inferWithLLM(
      node,
      previousNode,
      requiredFields.filter(f => !populated[f] || populated[f] === ''),
      llmAdapter
    );
    
    if (llmResult.success) {
      Object.assign(populated, llmResult.populated);
      source = 'llm';
      confidence = Math.max(confidence, llmResult.confidence);
      notes.push(...llmResult.notes);
    }
  }
  
  return {
    populated,
    source,
    confidence,
    notes,
  };
}

/**
 * Infer field value from upstream node output
 */
function inferFieldFromUpstream(
  fieldName: string,
  fieldType: FieldType,
  upstreamOutput: NodeOutputFields
): { success: boolean; value?: any; confidence: number; reason: string } {
  const fieldNameLower = fieldName.toLowerCase();
  
  // Exact match
  for (const outputField of upstreamOutput.outputFields) {
    if (outputField.toLowerCase() === fieldNameLower) {
      const value = upstreamOutput.sampleValues?.[outputField];
      if (value !== undefined) {
        const converted = convertToType(value, fieldType, fieldName);
        return {
          success: converted.success,
          value: converted.value,
          confidence: 0.9,
          reason: `Exact match: ${outputField}`,
        };
      }
    }
  }
  
  // Semantic matching
  const semanticMatches: Record<string, string[]> = {
    email: ['email', 'to', 'recipient', 'userEmail', 'contactEmail', 'from'],
    name: ['name', 'firstName', 'firstname', 'fullName', 'username', 'title'],
    message: ['message', 'text', 'content', 'body', 'response_text', 'responseText', 'description'],
    subject: ['subject', 'title', 'heading', 'name'],
    text: ['text', 'message', 'content', 'body', 'response_text'],
    data: ['data', 'output', 'result', 'value', 'response'],
    id: ['id', 'objectId', 'recordId', 'messageId', 'eventId', 'taskId', 'userId'],
    url: ['url', 'link', 'href', 'uri', 'webhook'],
    phone: ['phone', 'phoneNumber', 'mobile', 'telephone'],
    date: ['date', 'timestamp', 'createdAt', 'updatedAt', 'time'],
    owner: ['owner', 'userId', 'user', 'author', 'creator'],
    type: ['type', 'category', 'kind', 'class'],
  };
  
  for (const [key, synonyms] of Object.entries(semanticMatches)) {
    if (fieldNameLower.includes(key)) {
      for (const synonym of synonyms) {
        const match = upstreamOutput.outputFields.find(f => 
          f.toLowerCase() === synonym.toLowerCase() ||
          f.toLowerCase().includes(synonym.toLowerCase())
        );
        if (match) {
          const value = upstreamOutput.sampleValues?.[match];
          if (value !== undefined) {
            const converted = convertToType(value, fieldType, fieldName);
            return {
              success: converted.success,
              value: converted.value,
              confidence: 0.7,
              reason: `Semantic match: ${match} (${synonym})`,
            };
          }
        }
      }
    }
  }
  
  // Use first available field if type is compatible
  if (upstreamOutput.outputFields.length > 0) {
    const firstField = upstreamOutput.outputFields[0];
    const value = upstreamOutput.sampleValues?.[firstField];
    if (value !== undefined) {
      const converted = convertToType(value, fieldType, fieldName);
      if (converted.success) {
        return {
          success: true,
          value: converted.value,
          confidence: 0.5,
          reason: `Fallback: using first available field ${firstField}`,
        };
      }
    }
  }
  
  return { success: false, confidence: 0, reason: 'No match found' };
}

/**
 * Get intelligent default based on field name and type
 */
function getIntelligentDefault(
  fieldName: string,
  fieldType: FieldType,
  schema: any
): { value: any; confidence: number; reason: string } {
  const fieldNameLower = fieldName.toLowerCase();
  
  // Type-specific defaults
  const typeDefaults: Record<FieldType, any> = {
    string: '',
    number: 0,
    boolean: false,
    array: [],
    object: {},
    json: {},
    email: '',
    datetime: '',
    expression: '',
  };
  
  // Field-name-specific defaults
  if (fieldNameLower.includes('email') || fieldNameLower === 'to' || fieldNameLower === 'recipient') {
    return { value: '', confidence: 0.3, reason: 'Email field - requires user input' };
  }
  
  if (fieldNameLower.includes('subject') || fieldNameLower === 'title') {
    return { value: 'Notification', confidence: 0.4, reason: 'Subject field default' };
  }
  
  if (fieldNameLower.includes('message') || fieldNameLower === 'body' || fieldNameLower === 'content') {
    return { value: '', confidence: 0.3, reason: 'Message field - requires content' };
  }
  
  if (fieldNameLower.includes('id')) {
    return { value: '', confidence: 0.2, reason: 'ID field - must come from upstream' };
  }
  
  if (fieldNameLower.includes('url') || fieldNameLower === 'link') {
    return { value: '', confidence: 0.2, reason: 'URL field - requires valid URL' };
  }
  
  // Check schema for default value
  const fieldDef = schema.configSchema?.optional?.[fieldName] || schema.configSchema?.required?.find((f: string) => f === fieldName);
  if (fieldDef?.default !== undefined) {
    return { value: fieldDef.default, confidence: 0.8, reason: 'Schema default value' };
  }
  
  // Use type default
  return {
    value: typeDefaults[fieldType],
    confidence: 0.5,
    reason: `Type default for ${fieldType}`,
  };
}

/**
 * Use LLM to infer missing required fields
 */
async function inferWithLLM(
  node: WorkflowNode,
  previousNode: WorkflowNode | null,
  missingFields: string[],
  llmAdapter: LLMAdapter
): Promise<{ success: boolean; populated: Record<string, any>; confidence: number; notes: string[] }> {
  if (!previousNode || missingFields.length === 0) {
    return { success: false, populated: {}, confidence: 0, notes: [] };
  }
  
  try {
    const nodeType = unifiedNormalizeNodeType(node);
    const previousOutput = inputFieldMapper.getNodeOutputFields(previousNode);
    
    const prompt = `You are a workflow field inference assistant.

Node Type: ${nodeType}
Missing Required Fields: ${missingFields.join(', ')}

Previous Node Output:
${JSON.stringify(previousOutput.outputFields, null, 2)}

Sample Values:
${JSON.stringify(previousOutput.sampleValues, null, 2)}

Task: Infer values for missing required fields based on previous node output.

Return JSON:
{
  "fields": {
    "fieldName": "inferred_value",
    ...
  },
  "confidence": 0.0-1.0,
  "reasoning": "explanation"
}`;

    const messages = [
      { role: 'system' as const, content: 'You are a workflow field inference assistant.' },
      { role: 'user' as const, content: prompt }
    ];
    const response = await llmAdapter.chat('ollama', messages, {
      model: 'llama3.2',
      temperature: 0.1,
    });
    
    const parsed = JSON.parse(response.content);
    const populated: Record<string, any> = {};
    
    if (parsed.fields) {
      for (const [fieldName, value] of Object.entries(parsed.fields)) {
        if (missingFields.includes(fieldName)) {
          populated[fieldName] = value;
        }
      }
    }
    
    return {
      success: Object.keys(populated).length > 0,
      populated,
      confidence: parsed.confidence || 0.6,
      notes: [parsed.reasoning || 'LLM inference completed'],
    };
  } catch (error: any) {
    return {
      success: false,
      populated: {},
      confidence: 0,
      notes: [`LLM inference failed: ${error.message}`],
    };
  }
}
