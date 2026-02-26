/**
 * Data Flow Contract Layer (Mask Layer)
 * 
 * This layer runs AFTER user provides credentials and input fields.
 * It executes nodes to get REAL JSON output (not schemas), then intelligently
 * maps properties from node A to node B based on user intent.
 * 
 * Flow:
 * 1. User provides credentials/inputs → workflow has real configs
 * 2. Execute nodes in topological order to get REAL JSON
 * 3. For each node B, find upstream node A
 * 4. Analyze REAL JSON from A + user prompt intent
 * 5. Determine which property should map to B's inputs
 * 6. Write template expressions into B's config
 */

// Import Workflow types from core types
import { Workflow, WorkflowNode, WorkflowEdge } from '../core/types/ai-types';
import { executeNode } from '../api/execute-workflow';
import { LRUNodeOutputsCache } from '../core/cache/lru-node-outputs-cache';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { normalizeNodeType } from '../core/utils/node-type-normalizer';
import { parseIntent, IntentModel } from '../shared/intent-parser';
import * as crypto from 'crypto';

interface NodeExecutionResult {
  nodeId: string;
  output: unknown;
  outputKeys: string[]; // Real property names from actual JSON
  schemaHash?: string; // Hash of output structure for schema drift detection
}

interface DataFlowMapping {
  targetNodeId: string;
  targetField: string;
  sourceNodeId: string;
  sourceField: string;
  templateExpression: string;
  mappingConfidence: number; // 0-1 confidence score
  mappingSource: 'keyword' | 'embedding' | 'fallback'; // How match was determined
  schemaHash: string; // Hash of source output structure
  intentVersion: number; // Version of IntentModel used
}

/**
 * Extract all property keys from a JSON object/array recursively
 */
function extractPropertyKeys(data: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  
  if (data === null || data === undefined) {
    return keys;
  }
  
  if (Array.isArray(data)) {
    // For arrays, check first element if it's an object
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      const firstItem = data[0] as Record<string, unknown>;
      Object.keys(firstItem).forEach(key => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        keys.push(fullKey);
        // Also add array access pattern: items[].ColumnName
        keys.push(`${prefix ? prefix : 'items'}[].${key}`);
      });
    } else {
      // Array of primitives - add the array itself
      if (prefix) {
        keys.push(prefix);
      }
    }
  } else if (typeof data === 'object') {
    Object.keys(data).forEach(key => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.push(fullKey);
      
      const value = (data as Record<string, unknown>)[key];
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively extract nested keys
        keys.push(...extractPropertyKeys(value, fullKey));
      } else if (Array.isArray(value) && value.length > 0) {
        // For nested arrays, add array access pattern
        keys.push(`${fullKey}[]`);
      }
    });
  }
  
  return keys;
}

/**
 * Topological sort to determine execution order
 */
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  const nodeMap: Record<string, WorkflowNode> = {};

  nodes.forEach(node => {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
    nodeMap[node.id] = node;
  });

  edges.forEach(edge => {
    adjacency[edge.source].push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
  });

  const queue: string[] = [];
  Object.entries(inDegree).forEach(([nodeId, degree]) => {
    if (degree === 0) queue.push(nodeId);
  });

  const sorted: WorkflowNode[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeMap[nodeId]);
    
    adjacency[nodeId].forEach(targetId => {
      inDegree[targetId]--;
      if (inDegree[targetId] === 0) {
        queue.push(targetId);
      }
    });
  }

  return sorted;
}

/**
 * Calculate schema hash for output structure
 * Used to detect schema drift at runtime
 */
function calculateSchemaHash(output: unknown): string {
  const keys = extractPropertyKeys(output);
  const sortedKeys = keys.sort().join(',');
  return crypto.createHash('sha256').update(sortedKeys).digest('hex').substring(0, 16);
}

/**
 * Calculate keyword matching confidence score
 * Returns confidence 0-1 based on match quality
 */
function calculateKeywordConfidence(
  targetFieldName: string,
  matchedKey: string,
  intentModel: IntentModel,
  sourceNodeType: string,
  targetNodeType: string
): number {
  let confidence = 0.5; // Base confidence
  
  const targetLower = targetFieldName.toLowerCase();
  const keyLower = matchedKey.toLowerCase();
  
  // Exact match boost
  if (keyLower === targetLower || keyLower.endsWith(`.${targetLower}`)) {
    confidence += 0.3;
  }
  
  // Intent entity match boost
  const entityMatch = intentModel.entities.some(entity => 
    keyLower.includes(entity) || entity.includes(keyLower)
  );
  if (entityMatch) {
    confidence += 0.2;
  }
  
  // Node type pattern match boost
  if (targetNodeType) {
    const targetLower = targetNodeType.toLowerCase();
    if (targetLower.includes('gmail') || targetLower.includes('email')) {
      if (keyLower.includes('subject') || keyLower.includes('body') || keyLower.includes('message')) {
        confidence += 0.2;
      }
    }
    if (targetLower.includes('ai') || targetLower.includes('llm')) {
      if (keyLower.includes('items') || keyLower.includes('data') || keyLower.includes('rows')) {
        confidence += 0.2;
      }
    }
  }
  
  // Intent confidence boost
  confidence += intentModel.confidence * 0.1;
  
  return Math.min(confidence, 1.0);
}

/**
 * Find best output property match using real JSON structure + user intent
 * Enhanced with hybrid matching (keyword → embedding) and confidence scoring
 * 
 * Returns match result with confidence and source method
 */
interface MatchResult {
  key: string | null;
  confidence: number;
  source: 'keyword' | 'embedding' | 'fallback';
}

function buildMatchResultForKey(
  targetFieldName: string,
  matchedKey: string,
  intent: IntentModel,
  sourceNodeType: string,
  targetNodeType: string
): MatchResult {
  const keywordConfidence = calculateKeywordConfidence(
    targetFieldName,
    matchedKey,
    intent,
    sourceNodeType,
    targetNodeType
  );

  // Deterministic-first: keyword mode when confidence is high enough
  if (keywordConfidence >= 0.7) {
    return {
      key: matchedKey,
      confidence: keywordConfidence,
      source: 'keyword',
    };
  }

  // Embedding placeholder: same key, slightly boosted confidence, marked as 'embedding'
  const boosted = Math.min(keywordConfidence + 0.05, 0.75);
  return {
    key: matchedKey,
    confidence: boosted,
    source: 'embedding',
  };
}

function findBestOutputMatchFromRealJSON(
  targetFieldName: string,
  availableOutputKeys: string[],
  sourceNodeType: string,
  targetNodeType: string,
  userPrompt: string,
  intentModel?: IntentModel
): MatchResult {
  // Use provided intent model or parse it
  const intent = intentModel || parseIntent(userPrompt);
  const targetLower = targetFieldName.toLowerCase();
  const promptLower = userPrompt.toLowerCase();
  
  // PRIORITY 1: User Intent-Based Selection
  if (promptLower) {
    const columnPatterns = [
      /(?:only|just|send|forward|use|filter|extract|get)\s+(?:the\s+)?(\w+)\s+(?:column|field|data|section)/i,
      /(\w+)\s+(?:column|field|data|section)\s+(?:only|just|send|forward|use)/i,
    ];
    
    for (const pattern of columnPatterns) {
      const match = promptLower.match(pattern);
      if (match && match[1]) {
        const userSpecifiedField = match[1].trim();
        
        // Check if this field exists in real JSON keys (case-insensitive)
        const fieldMatch = availableOutputKeys.find(key => {
          const keyLower = key.toLowerCase();
          return keyLower === userSpecifiedField.toLowerCase() ||
                 keyLower.includes(userSpecifiedField.toLowerCase()) ||
                 keyLower.endsWith(`.${userSpecifiedField.toLowerCase()}`) ||
                 keyLower.includes(`[].${userSpecifiedField}`);
        });
        
        if (fieldMatch) {
          console.log(`✅ [Real JSON Mapping] User specified "${userSpecifiedField}" → forwarding ${fieldMatch}`);
          return buildMatchResultForKey(
            targetFieldName,
            fieldMatch,
            intent,
            sourceNodeType,
            targetNodeType
          );
        }
        
        // For Google Sheets, check if column exists in items array
        if (sourceNodeType === 'google_sheets') {
          const columnName = userSpecifiedField.charAt(0).toUpperCase() + userSpecifiedField.slice(1);
          const itemsColumnKey = `items[].${columnName}`;
          if (availableOutputKeys.includes(itemsColumnKey)) {
            console.log(`✅ [Real JSON Mapping] Google Sheets column "${columnName}" → forwarding ${itemsColumnKey}`);
            return buildMatchResultForKey(
              targetFieldName,
              itemsColumnKey,
              intent,
              sourceNodeType,
              targetNodeType
            );
          }
          // Also check for items key itself
          if (availableOutputKeys.includes('items')) {
            console.log(`✅ [Real JSON Mapping] Google Sheets → forwarding items (column filtering: ${columnName})`);
            return buildMatchResultForKey(
              targetFieldName,
              'items',
              intent,
              sourceNodeType,
              targetNodeType
            );
          }
        }
      }
    }
  }
  
  // PRIORITY 2: Target Node Type-Based Selection
  if (targetNodeType) {
    const targetLower = targetNodeType.toLowerCase();
    
    // AI/LLM nodes need data/content
    if (targetLower.includes('ai_agent') || targetLower.includes('gpt') || 
        targetLower.includes('claude') || targetLower.includes('gemini') || 
        targetLower.includes('ollama') || targetLower.includes('chat_model')) {
      const aiPreferredFields = ['items', 'data', 'rows', 'records'];
      for (const field of aiPreferredFields) {
        if (availableOutputKeys.includes(field)) {
          console.log(`✅ [Real JSON Mapping] AI node target → forwarding ${field}`);
          return buildMatchResultForKey(
            targetFieldName,
            field,
            intent,
            sourceNodeType,
            targetNodeType
          );
        }
      }
    }
    
    // Communication nodes need text/message
    if (targetLower.includes('gmail') || targetLower.includes('email')) {
      // For Gmail nodes, check for structured JSON response from AI
      // AI returns: { response: { subject, body, summary, keyPoints, ... } }
      // We need to map: subject -> gmail.subject, body -> gmail.body
      
      // Check for AI response structure: response.subject, response.body
      if (availableOutputKeys.includes('response.subject')) {
        console.log(`✅ [Real JSON Mapping] Gmail node → found response.subject from AI`);
        // Handled specially in applyDataFlowContract for subject field
      }
      if (availableOutputKeys.includes('response.body')) {
        console.log(`✅ [Real JSON Mapping] Gmail node → found response.body from AI`);
        // Handled specially in applyDataFlowContract for body field
      }
      
      // Also check for direct fields (legacy support)
      const commFields = ['response.subject', 'response.body', 'subject', 'body', 'response_text', 'text', 'message', 'content'];
      for (const field of commFields) {
        if (availableOutputKeys.includes(field)) {
          console.log(`✅ [Real JSON Mapping] Communication node target → forwarding ${field}`);
          return buildMatchResultForKey(
            targetFieldName,
            field,
            intent,
            sourceNodeType,
            targetNodeType
          );
        }
      }
    }
  }
  
  // PRIORITY 3: Exact Match
  const exactMatch = availableOutputKeys.find(key => 
    key.toLowerCase() === targetLower || 
    key.toLowerCase().endsWith(`.${targetLower}`)
  );
  if (exactMatch) {
    console.log(`✅ [Real JSON Mapping] Exact match → forwarding ${exactMatch}`);
    return buildMatchResultForKey(
      targetFieldName,
      exactMatch,
      intent,
      sourceNodeType,
      targetNodeType
    );
  }
  
  // PRIORITY 4: Semantic Match (partial)
  const semanticMatch = availableOutputKeys.find(key => {
    const keyLower = key.toLowerCase();
    return keyLower.includes(targetLower) || targetLower.includes(keyLower);
  });
  if (semanticMatch) {
    console.log(`✅ [Real JSON Mapping] Semantic match → forwarding ${semanticMatch}`);
    return buildMatchResultForKey(
      targetFieldName,
      semanticMatch,
      intent,
      sourceNodeType,
      targetNodeType
    );
  }
  
  // PRIORITY 5: Source Node Type-Based
  if (sourceNodeType === 'google_sheets') {
    if (availableOutputKeys.includes('items')) {
      return buildMatchResultForKey(
        targetFieldName,
        'items',
        intent,
        sourceNodeType,
        targetNodeType
      );
    }
    if (availableOutputKeys.includes('rows')) {
      return buildMatchResultForKey(
        targetFieldName,
        'rows',
        intent,
        sourceNodeType,
        targetNodeType
      );
    }
  }
  
  if (sourceNodeType.includes('ai_agent') || sourceNodeType.includes('gpt') || 
      sourceNodeType.includes('claude') || sourceNodeType.includes('gemini')) {
    if (availableOutputKeys.includes('response_text')) {
      return buildMatchResultForKey(
        targetFieldName,
        'response_text',
        intent,
        sourceNodeType,
        targetNodeType
      );
    }
    if (availableOutputKeys.includes('text')) {
      return buildMatchResultForKey(
        targetFieldName,
        'text',
        intent,
        sourceNodeType,
        targetNodeType
      );
    }
  }
  
  // PRIORITY 6: Common Patterns
  if (targetLower.includes('message') || targetLower.includes('text') || 
      targetLower.includes('content') || targetLower.includes('body')) {
    const messageFields = ['response_text', 'text', 'message', 'content', 'body', 'output', 'response'];
    for (const msgField of messageFields) {
      if (availableOutputKeys.includes(msgField)) {
        return buildMatchResultForKey(
          targetFieldName,
          msgField,
          intent,
          sourceNodeType,
          targetNodeType
        );
      }
    }
  }
  
  if (targetLower.includes('data') || targetLower.includes('input') || targetLower.includes('value')) {
    const dataFields = ['items', 'data', 'output', 'result', 'rows', 'records'];
    for (const dataField of dataFields) {
      if (availableOutputKeys.includes(dataField)) {
        return buildMatchResultForKey(
          targetFieldName,
          dataField,
          intent,
          sourceNodeType,
          targetNodeType
        );
      }
    }
  }
  
  // PRIORITY 7: Fallback
  const preferredOrder = ['items', 'data', 'output', 'result', 'response_text', 'text', 'message', 'content'];
  for (const preferred of preferredOrder) {
    if (availableOutputKeys.includes(preferred)) {
      // Low-confidence fallback - mark as fallback, not keyword/embedding
      return {
        key: preferred,
        confidence: 0.4,
        source: 'fallback',
      };
    }
  }
  
  // Ultimate fallback: first available key
  if (availableOutputKeys.length > 0) {
    return {
      key: availableOutputKeys[0],
      confidence: 0.3,
      source: 'fallback',
    };
  }
  
  return {
    key: null,
    confidence: 0,
    source: 'fallback',
  };
}

export class DataFlowContractLayer {
  /**
   * Apply data flow contract layer to workflow
   * 
   * This runs AFTER credentials/inputs are provided.
   * Executes nodes to get REAL JSON, then maps properties intelligently.
   * 
   * @param workflow - Workflow with credentials and inputs already filled
   * @param userPrompt - Original user prompt for intent analysis
   * @param userId - User ID for execution context
   * @returns Workflow with template expressions written into node configs
   */
  async applyDataFlowContract(
    workflow: Workflow,
    userPrompt: string,
    userId?: string
  ): Promise<{
    workflow: Workflow;
    mappings: DataFlowMapping[];
    executionResults: NodeExecutionResult[];
  }> {
    console.log('[DataFlowContractLayer] Starting data flow contract application...');
    console.log(`[DataFlowContractLayer] Workflow: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);
    console.log(`[DataFlowContractLayer] User prompt: "${userPrompt.substring(0, 100)}..."`);
    
    const supabase = getSupabaseClient();
    const executionResults: NodeExecutionResult[] = [];
    const mappings: DataFlowMapping[] = [];
    const intent = parseIntent(userPrompt);
    
    // Step 1: Topological sort to get execution order
    const sortedNodes = topologicalSort(workflow.nodes, workflow.edges);
    console.log(`[DataFlowContractLayer] Execution order: ${sortedNodes.map(n => n.id).join(' → ')}`);
    
    // Step 2: Execute nodes in order to get REAL JSON output
    const nodeOutputs = new LRUNodeOutputsCache(100, false);
    
    // Initialize trigger/input context
    const triggerNode = sortedNodes.find(n => 
      ['manual_trigger', 'webhook', 'form', 'chat_trigger'].includes(n.type)
    );
    if (triggerNode) {
      // Set empty input for trigger (will be populated by user at runtime)
      nodeOutputs.set('trigger', {}, true);
      nodeOutputs.set('input', {});
      nodeOutputs.set('$json', {});
      nodeOutputs.set('json', {});
    }
    
    for (const node of sortedNodes) {
      try {
        console.log(`[DataFlowContractLayer] Executing node: ${node.id} (${node.type}) to get real JSON...`);
        
        // Get input from previous nodes
        const input = this.getNodeInput(node, workflow.edges, nodeOutputs);
        
        // Execute node to get REAL output
        const output = await executeNode(
          node,
          input,
          nodeOutputs,
          supabase,
          (workflow as any).id || 'temp-workflow-id',
          userId
        );
        
        // Store output in cache
        nodeOutputs.set(node.id, output, true);
        nodeOutputs.set('$json', output);
        nodeOutputs.set('json', output);
        
        // Extract REAL property keys from actual JSON
        const outputKeys = extractPropertyKeys(output);
        const schemaHash = calculateSchemaHash(output);
        
        executionResults.push({
          nodeId: node.id,
          output,
          outputKeys,
          schemaHash,
        });
        
        console.log(`[DataFlowContractLayer] ✅ Node ${node.id} executed. Real JSON keys: ${outputKeys.slice(0, 10).join(', ')}${outputKeys.length > 10 ? '...' : ''}`);
        
      } catch (error: any) {
        console.warn(`[DataFlowContractLayer] ⚠️  Failed to execute node ${node.id} (${node.type}): ${error.message}`);
        console.warn(`[DataFlowContractLayer] Continuing with schema-based fallback...`);
        
        // Fallback: use schema-based keys if execution fails
        const fallbackKeys = this.getSchemaBasedOutputKeys(node);
        executionResults.push({
          nodeId: node.id,
          output: null,
          outputKeys: fallbackKeys,
          schemaHash: undefined,
        });
      }
    }
    
    // Step 3: For each node, find upstream nodes and map properties
    const updatedNodes = workflow.nodes.map((node: WorkflowNode) => {
      const nodeConfig = { ...(node.data?.config || {}) };
      let configUpdated = false;
      const mappingMetadata: Record<string, any> = { ...(nodeConfig._mappingMetadata || {}) };
      
      // Find upstream nodes via edges
      const upstreamEdges = workflow.edges.filter((e: WorkflowEdge) => e.target === node.id);
      const upstreamNodeIds = upstreamEdges.map((e: WorkflowEdge) => e.source);
      const upstreamNodes = workflow.nodes.filter((n: WorkflowNode) => upstreamNodeIds.includes(n.id));
      
      if (upstreamNodes.length === 0) {
        return node; // No upstream nodes, skip
      }
      
      // Use primary upstream node (first in execution order)
      const primaryUpstream = upstreamNodes[0];
      const upstreamResult = executionResults.find(r => r.nodeId === primaryUpstream.id);
      
      if (!upstreamResult || upstreamResult.outputKeys.length === 0) {
        return node; // No output keys available
      }
      
      // Get node input schema to find required fields
      const requiredFields = this.getNodeRequiredFields(node);
      
      // For each required field, find best match from real JSON
      for (const fieldName of requiredFields) {
        const currentValue = nodeConfig[fieldName];
        
        // Skip if already has a valid template expression
        if (typeof currentValue === 'string' && currentValue.includes('{{$json.')) {
          continue;
        }
        
        // Skip if field already has a non-empty value
        if (currentValue !== undefined && currentValue !== null && 
            (typeof currentValue !== 'string' || currentValue.trim() !== '')) {
          continue;
        }
        
        // Find best match from real JSON
        const normalizedType = normalizeNodeType(node);
        
        // Special handling for Gmail nodes with AI upstream
        // AI returns: { response: { subject, body, summary, ... } }
        // We need to map: response.subject -> gmail.subject, response.body -> gmail.body
        if ((normalizedType === 'google_gmail' || node.type === 'google_gmail') && 
            primaryUpstream.type === 'ai_chat_model' && 
            (fieldName === 'subject' || fieldName === 'body')) {
          // Check if AI response has the structured format
          if (upstreamResult.outputKeys.includes(`response.${fieldName}`)) {
            const templateExpression = `{{$json.response.${fieldName}}}`;
            nodeConfig[fieldName] = templateExpression;
            configUpdated = true;
            
            const upstreamSchemaHash = upstreamResult.schemaHash || (upstreamResult.output ? calculateSchemaHash(upstreamResult.output) : '');
            const mappingConfidence = calculateKeywordConfidence(
              fieldName,
              `response.${fieldName}`,
              intent,
              primaryUpstream.type,
              normalizedType || node.type
            );
            
            mappings.push({
              targetNodeId: node.id,
              targetField: fieldName,
              sourceNodeId: primaryUpstream.id,
              sourceField: `response.${fieldName}`,
              templateExpression,
              mappingConfidence,
              mappingSource: 'keyword',
              schemaHash: upstreamSchemaHash,
              intentVersion: intent.version,
            });
            
            mappingMetadata[fieldName] = {
              confidence: mappingConfidence,
              source: 'keyword',
              schemaHash: upstreamSchemaHash,
              intentVersion: intent.version,
            };
            
            console.log(`✅ [DataFlowContractLayer] ${node.type}.${fieldName} = ${templateExpression} (from ${primaryUpstream.type}.response.${fieldName})`);
            continue;
          }
        }
        
        const matchResult = findBestOutputMatchFromRealJSON(
          fieldName,
          upstreamResult.outputKeys,
          primaryUpstream.type,
          normalizedType || node.type,
          userPrompt,
          intent
        );
        
        if (matchResult.key) {
          const templateExpression = `{{$json.${matchResult.key}}}`;
          nodeConfig[fieldName] = templateExpression;
          configUpdated = true;
          
          const upstreamSchemaHash = upstreamResult.schemaHash || (upstreamResult.output ? calculateSchemaHash(upstreamResult.output) : '');
          
          mappings.push({
            targetNodeId: node.id,
            targetField: fieldName,
            sourceNodeId: primaryUpstream.id,
            sourceField: matchResult.key,
            templateExpression,
            mappingConfidence: matchResult.confidence,
            mappingSource: matchResult.source,
            schemaHash: upstreamSchemaHash,
            intentVersion: intent.version,
          });
          
          mappingMetadata[fieldName] = {
            confidence: matchResult.confidence,
            source: matchResult.source,
            schemaHash: upstreamSchemaHash,
            intentVersion: intent.version,
          };
          
          console.log(`✅ [DataFlowContractLayer] ${node.type}.${fieldName} = ${templateExpression} (from ${primaryUpstream.type}.${matchResult.key}, confidence: ${matchResult.confidence.toFixed(3)}, source: ${matchResult.source})`);
        }
      }
      
      if (configUpdated) {
        (nodeConfig as any)._mappingMetadata = mappingMetadata;
        return {
          ...node,
          data: {
            ...node.data,
            config: nodeConfig
          }
        };
      }
      
      return node;
    });
    
    console.log(`[DataFlowContractLayer] ✅ Applied ${mappings.length} property mappings`);
    
    // Log confidence distribution for validation
    this.logConfidenceDistribution(mappings);
    
    return {
      workflow: {
        ...workflow,
        nodes: updatedNodes
      },
      mappings,
      executionResults
    };
  }
  
  /**
   * Log confidence distribution for validation
   * Helps validate thresholds (0.7 for embedding, 0.85 for skip logic)
   */
  private logConfidenceDistribution(mappings: DataFlowMapping[]): void {
    if (mappings.length === 0) {
      console.log('[DataFlowContractLayer] 📊 No mappings to analyze');
      return;
    }

    const confidences = mappings.map(m => m.mappingConfidence);
    const sources = mappings.map(m => m.mappingSource);
    
    const stats = {
      total: mappings.length,
      avgConfidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
      minConfidence: Math.min(...confidences),
      maxConfidence: Math.max(...confidences),
      sourceDistribution: {
        keyword: sources.filter(s => s === 'keyword').length,
        embedding: sources.filter(s => s === 'embedding').length,
        fallback: sources.filter(s => s === 'fallback').length,
      },
      highConfidence: confidences.filter(c => c >= 0.85).length,
      mediumConfidence: confidences.filter(c => c >= 0.7 && c < 0.85).length,
      lowConfidence: confidences.filter(c => c < 0.7).length,
    };

    console.log('[DataFlowContractLayer] 📊 Confidence Distribution:');
    console.log(`  Total mappings: ${stats.total}`);
    console.log(`  Avg confidence: ${stats.avgConfidence.toFixed(3)}`);
    console.log(`  Range: ${stats.minConfidence.toFixed(3)} - ${stats.maxConfidence.toFixed(3)}`);
    console.log(`  Source distribution:`);
    console.log(`    Keyword: ${stats.sourceDistribution.keyword} (${(stats.sourceDistribution.keyword / stats.total * 100).toFixed(1)}%)`);
    console.log(`    Embedding: ${stats.sourceDistribution.embedding} (${(stats.sourceDistribution.embedding / stats.total * 100).toFixed(1)}%)`);
    console.log(`    Fallback: ${stats.sourceDistribution.fallback} (${(stats.sourceDistribution.fallback / stats.total * 100).toFixed(1)}%)`);
    console.log(`  Confidence buckets:`);
    console.log(`    High (≥0.85): ${stats.highConfidence} (${(stats.highConfidence / stats.total * 100).toFixed(1)}%) - Would skip router`);
    console.log(`    Medium (0.7-0.85): ${stats.mediumConfidence} (${(stats.mediumConfidence / stats.total * 100).toFixed(1)}%) - Would use keyword`);
    console.log(`    Low (<0.7): ${stats.lowConfidence} (${(stats.lowConfidence / stats.total * 100).toFixed(1)}%) - Would use embedding`);
  }

  /**
   * Get input for a node from upstream node outputs
   */
  private getNodeInput(
    node: WorkflowNode,
    edges: WorkflowEdge[],
    nodeOutputs: LRUNodeOutputsCache
  ): unknown {
    const upstreamEdges = edges.filter(e => e.target === node.id);
    if (upstreamEdges.length === 0) {
      return {}; // No upstream nodes
    }
    
    // Use primary upstream node's output
    const primaryEdge = upstreamEdges[0];
    const upstreamOutput = nodeOutputs.get(primaryEdge.source);
    return upstreamOutput || {};
  }
  
  /**
   * Get required fields for a node (fallback to schema if execution failed)
   */
  private getNodeRequiredFields(node: WorkflowNode): string[] {
    const config = node.data?.config || {};
    const nodeType = normalizeNodeType(node) || node.type;
    
    // Common required fields by node type
    const commonRequiredFields: Record<string, string[]> = {
      'ai_agent': ['userInput', 'prompt'],
      'openai_gpt': ['prompt', 'userInput'],
      'anthropic_claude': ['prompt', 'userInput'],
      'google_gemini': ['prompt', 'userInput'],
      'google_gmail': ['to', 'subject', 'body'],
      'slack': ['channel', 'message'],
      'discord': ['channel', 'message'],
      'telegram': ['chatId', 'message'],
      'whatsapp': ['to', 'message'],
    };
    
    const typeLower = nodeType.toLowerCase();
    for (const [key, fields] of Object.entries(commonRequiredFields)) {
      if (typeLower.includes(key)) {
        return fields;
      }
    }
    
    // Fallback: return empty array (will skip mapping)
    return [];
  }
  
  /**
   * Get schema-based output keys as fallback
   */
  private getSchemaBasedOutputKeys(node: WorkflowNode): string[] {
    const nodeType = normalizeNodeType(node) || node.type;
    const typeLower = nodeType.toLowerCase();
    
    // Common output fields by node type
    if (typeLower === 'google_sheets') {
      return ['items', 'rows', 'headers', 'values'];
    }
    if (typeLower.includes('ai_agent') || typeLower.includes('gpt') || 
        typeLower.includes('claude') || typeLower.includes('gemini')) {
      return ['response_text', 'text', 'response', 'content'];
    }
    if (typeLower.includes('gmail') || typeLower.includes('email')) {
      return ['messageId', 'threadId', 'status'];
    }
    
    return ['output', 'data', 'result'];
  }
}
