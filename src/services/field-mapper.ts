/**
 * Automatic Field Mapper
 * 
 * Maps output fields of one node to input fields of next node automatically.
 * 
 * Techniques:
 * - Field name similarity (string matching, normalization)
 * - Embedding similarity (semantic matching)
 * - Schema matching (type compatibility)
 * 
 * Example:
 * "CustomerEmail" → "email"
 * "user_name" → "username"
 * "order_total" → "total"
 */

import { WorkflowNode, WorkflowEdge } from '../core/types/ai-types';
import { getNodeOutputSchema, NodeOutputSchema } from '../core/types/node-output-types';
import { nodeLibrary } from './nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../core/utils/unified-node-type-normalizer';
import { inputFieldMapper, NodeOutputFields } from './ai/input-field-mapper';
import { EmbeddingGenerator, getEmbeddingGenerator } from '../memory/utils/embeddings';

/**
 * Field mapping result
 */
export interface FieldMappingResult {
  sourceField: string;
  targetField: string;
  confidence: number; // 0-1
  method: 'exact' | 'similarity' | 'embedding' | 'schema' | 'fallback';
  similarity?: number; // For similarity-based matches
  typeCompatible: boolean;
}

/**
 * Field mapping configuration
 */
export interface FieldMappingConfig {
  sourceNode: WorkflowNode;
  targetNode: WorkflowNode;
  sourceFields: string[];
  targetFields: string[];
  mappings: FieldMappingResult[];
}

/**
 * Field Mapper Class
 */
export class FieldMapper {
  private embeddingGenerator: EmbeddingGenerator | null = null;
  
  constructor() {
    // Initialize embedding generator if available
    try {
      this.embeddingGenerator = getEmbeddingGenerator();
    } catch (error) {
      console.warn('[FieldMapper] Embedding generator not available, will use string similarity only');
    }
  }
  /**
   * Map fields between source and target nodes
   */
  async mapFields(
    sourceNode: WorkflowNode,
    targetNode: WorkflowNode
  ): Promise<FieldMappingConfig> {
    console.log(`[FieldMapper] Mapping fields from ${sourceNode.id} to ${targetNode.id}`);
    
    // Get output fields from source node
    const sourceOutput = inputFieldMapper.getNodeOutputFields(sourceNode);
    const sourceFields = sourceOutput.outputFields;
    
    // Get input fields from target node
    const targetFields = this.getTargetInputFields(targetNode);
    
    console.log(`[FieldMapper] Source fields: ${sourceFields.join(', ')}`);
    console.log(`[FieldMapper] Target fields: ${targetFields.join(', ')}`);
    
    // Map each target field to a source field
    const mappings: FieldMappingResult[] = [];
    
    for (const targetField of targetFields) {
      const mapping = await this.findBestMapping(
        targetField,
        sourceFields,
        sourceOutput,
        targetNode
      );
      
      if (mapping) {
        mappings.push(mapping);
        console.log(`[FieldMapper] Mapped ${targetField} ← ${mapping.sourceField} (${mapping.method}, confidence: ${mapping.confidence.toFixed(2)})`);
      }
    }
    
    return {
      sourceNode,
      targetNode,
      sourceFields,
      targetFields,
      mappings,
    };
  }
  
  /**
   * Find best mapping for a target field
   */
  private async findBestMapping(
    targetField: string,
    sourceFields: string[],
    sourceOutput: NodeOutputFields,
    targetNode: WorkflowNode
  ): Promise<FieldMappingResult | null> {
    if (sourceFields.length === 0) {
      return null;
    }
    
    const targetNodeType = unifiedNormalizeNodeType(targetNode);
    const targetFieldType = this.getFieldType(targetField, targetNodeType);
    
    // Try exact match first (synchronous)
    const exactResult = this.exactMatch(targetField, sourceFields, sourceOutput, targetFieldType);
    if (exactResult && exactResult.confidence > 0.9) {
      return exactResult;
    }
    
    // Try embedding match (async)
    const embeddingResult = await this.embeddingMatch(targetField, sourceFields, sourceOutput, targetFieldType);
    if (embeddingResult && embeddingResult.confidence > 0.75) {
      return embeddingResult;
    }
    
    // Try string similarity (synchronous)
    const similarityResult = this.similarityMatch(targetField, sourceFields, sourceOutput, targetFieldType);
    if (similarityResult && similarityResult.confidence > 0.7) {
      return similarityResult;
    }
    
    // Try schema match (synchronous)
    const schemaResult = this.schemaMatch(targetField, sourceFields, sourceOutput, targetFieldType);
    if (schemaResult && schemaResult.confidence > 0.6) {
      return schemaResult;
    }
    
    // Return best match even if confidence is low
    return this.fallbackMatch(targetField, sourceFields, sourceOutput, targetFieldType);
  }
  
  /**
   * Exact field name match
   */
  private exactMatch(
    targetField: string,
    sourceFields: string[],
    sourceOutput: NodeOutputFields,
    targetFieldType: string
  ): FieldMappingResult | null {
    // Case-insensitive exact match
    const targetLower = this.normalizeFieldName(targetField);
    const exactMatch = sourceFields.find(f => 
      this.normalizeFieldName(f) === targetLower
    );
    
    if (exactMatch) {
      return {
        sourceField: exactMatch,
        targetField,
        confidence: 1.0,
        method: 'exact',
        typeCompatible: this.isTypeCompatible(
          this.getFieldType(exactMatch, sourceOutput.nodeType),
          targetFieldType
        ),
      };
    }
    
    return null;
  }
  
  /**
   * Embedding-based matching (semantic similarity)
   */
  private async embeddingMatch(
    targetField: string,
    sourceFields: string[],
    sourceOutput: NodeOutputFields,
    targetFieldType: string
  ): Promise<FieldMappingResult | null> {
    if (!this.embeddingGenerator || !this.embeddingGenerator.isAvailable()) {
      return null; // Fallback to string similarity
    }
    
    try {
      // Generate embedding for target field
      const targetEmbedding = await this.embeddingGenerator.generateEmbedding(targetField);
      
      // Generate embeddings for all source fields
      const sourceEmbeddings = await Promise.all(
        sourceFields.map(async (field) => ({
          field,
          embedding: await this.embeddingGenerator!.generateEmbedding(field),
        }))
      );
      
      // Calculate cosine similarity for each source field
      let bestMatch: { field: string; similarity: number } | null = null;
      
      for (const { field, embedding } of sourceEmbeddings) {
        const similarity = this.cosineSimilarity(targetEmbedding, embedding);
        
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { field, similarity };
        }
      }
      
      // Use embedding match if similarity is high enough
      if (bestMatch && bestMatch.similarity > 0.75) {
        return {
          sourceField: bestMatch.field,
          targetField,
          confidence: bestMatch.similarity,
          method: 'embedding',
          similarity: bestMatch.similarity,
          typeCompatible: this.isTypeCompatible(
            this.getFieldType(bestMatch.field, sourceOutput.nodeType),
            targetFieldType
          ),
        };
      }
    } catch (error) {
      console.warn(`[FieldMapper] Embedding match failed:`, error);
      // Fallback to string similarity
    }
    
    return null;
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  /**
   * Similarity-based matching (string similarity)
   */
  private similarityMatch(
    targetField: string,
    sourceFields: string[],
    sourceOutput: NodeOutputFields,
    targetFieldType: string
  ): FieldMappingResult | null {
    const targetNormalized = this.normalizeFieldName(targetField);
    let bestMatch: { field: string; similarity: number } | null = null;
    
    for (const sourceField of sourceFields) {
      const sourceNormalized = this.normalizeFieldName(sourceField);
      const similarity = this.calculateSimilarity(targetNormalized, sourceNormalized);
      
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { field: sourceField, similarity };
      }
    }
    
    if (bestMatch && bestMatch.similarity > 0.7) {
      return {
        sourceField: bestMatch.field,
        targetField,
        confidence: bestMatch.similarity,
        method: 'similarity',
        similarity: bestMatch.similarity,
        typeCompatible: this.isTypeCompatible(
          this.getFieldType(bestMatch.field, sourceOutput.nodeType),
          targetFieldType
        ),
      };
    }
    
    return null;
  }
  
  /**
   * Schema-based matching (type compatibility)
   */
  private schemaMatch(
    targetField: string,
    sourceFields: string[],
    sourceOutput: NodeOutputFields,
    targetFieldType: string
  ): FieldMappingResult | null {
    // Find source fields with compatible types
    const compatibleFields = sourceFields.filter(field => {
      const sourceFieldType = this.getFieldType(field, sourceOutput.nodeType);
      return this.isTypeCompatible(sourceFieldType, targetFieldType);
    });
    
    if (compatibleFields.length === 0) {
      return null;
    }
    
    // If only one compatible field, use it
    if (compatibleFields.length === 1) {
      return {
        sourceField: compatibleFields[0],
        targetField,
        confidence: 0.8,
        method: 'schema',
        typeCompatible: true,
      };
    }
    
    // Multiple compatible fields - use similarity to choose
    const targetNormalized = this.normalizeFieldName(targetField);
    let bestMatch: { field: string; similarity: number } | null = null;
    
    for (const field of compatibleFields) {
      const fieldNormalized = this.normalizeFieldName(field);
      const similarity = this.calculateSimilarity(targetNormalized, fieldNormalized);
      
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { field, similarity };
      }
    }
    
    if (bestMatch) {
      return {
        sourceField: bestMatch.field,
        targetField,
        confidence: 0.7 + (bestMatch.similarity * 0.2), // Boost confidence for schema match
        method: 'schema',
        similarity: bestMatch.similarity,
        typeCompatible: true,
      };
    }
    
    return null;
  }
  
  /**
   * Fallback matching (use common fields or first available)
   */
  private fallbackMatch(
    targetField: string,
    sourceFields: string[],
    sourceOutput: NodeOutputFields,
    targetFieldType: string
  ): FieldMappingResult | null {
    // Try common field names
    const commonMappings: Record<string, string[]> = {
      'email': ['email', 'e_mail', 'email_address', 'customer_email', 'user_email'],
      'name': ['name', 'full_name', 'user_name', 'customer_name'],
      'username': ['username', 'user_name', 'login', 'user'],
      'phone': ['phone', 'phone_number', 'mobile', 'telephone'],
      'address': ['address', 'street_address', 'location'],
      'total': ['total', 'amount', 'sum', 'order_total', 'price'],
      'status': ['status', 'state', 'current_status'],
      'date': ['date', 'created_at', 'updated_at', 'timestamp'],
    };
    
    const targetLower = this.normalizeFieldName(targetField);
    
    // Check if target field matches a common mapping
    for (const [commonField, variants] of Object.entries(commonMappings)) {
      if (variants.includes(targetLower)) {
        // Find matching source field
        for (const variant of variants) {
          const match = sourceFields.find(f => 
            this.normalizeFieldName(f) === variant
          );
          if (match) {
            return {
              sourceField: match,
              targetField,
              confidence: 0.6,
              method: 'fallback',
              typeCompatible: this.isTypeCompatible(
                this.getFieldType(match, sourceOutput.nodeType),
                targetFieldType
              ),
            };
          }
        }
      }
    }
    
    // Last resort: use first available field or common output field
    const fallbackField = sourceFields[0] || sourceOutput.commonFields[0] || 'data';
    
    return {
      sourceField: fallbackField,
      targetField,
      confidence: 0.4,
      method: 'fallback',
      typeCompatible: this.isTypeCompatible(
        this.getFieldType(fallbackField, sourceOutput.nodeType),
        targetFieldType
      ),
    };
  }
  
  /**
   * Calculate string similarity (Levenshtein-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    // Check for substring matches
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.8;
    }
    
    // Check for common words
    const words1 = str1.split(/[_\s-]+/);
    const words2 = str2.split(/[_\s-]+/);
    const commonWords = words1.filter(w => words2.includes(w));
    if (commonWords.length > 0) {
      return 0.6 + (commonWords.length / Math.max(words1.length, words2.length)) * 0.2;
    }
    
    // Levenshtein distance
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - (distance / maxLength);
  }
  
  /**
   * Levenshtein distance calculation
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1       // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * Normalize field name for comparison
   */
  private normalizeFieldName(fieldName: string): string {
    return fieldName
      .toLowerCase()
      .replace(/[_\s-]+/g, '_')  // Normalize separators
      .replace(/[^a-z0-9_]/g, '') // Remove special chars
      .replace(/^_+|_+$/g, '');   // Trim underscores
  }
  
  /**
   * Get input fields for target node
   */
  private getTargetInputFields(targetNode: WorkflowNode): string[] {
    const nodeType = unifiedNormalizeNodeType(targetNode);
    const schema = nodeLibrary.getSchema(nodeType);
    
    if (!schema) {
      return ['input']; // Default
    }
    
    // Get required and optional input fields from schema
    const requiredFields = schema.configSchema?.required || [];
    const optionalFields = Object.keys(schema.configSchema?.optional || {});
    
    // Combine and filter out credential fields
    const allFields = [...requiredFields, ...optionalFields];
    return allFields.filter(field => !this.isCredentialField(field, nodeType));
  }
  
  /**
   * Check if field is a credential field
   */
  private isCredentialField(fieldName: string, nodeType: string): boolean {
    const credentialKeywords = ['credential', 'auth', 'token', 'api_key', 'password', 'secret'];
    const fieldLower = fieldName.toLowerCase();
    return credentialKeywords.some(keyword => fieldLower.includes(keyword));
  }
  
  /**
   * Get field type from node schema
   */
  private getFieldType(fieldName: string, nodeType: string): string {
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema) {
      return 'string'; // Default
    }
    
    // Check config schema
    const configField = schema.configSchema?.optional?.[fieldName];
    if (configField) {
      return configField.type || 'string';
    }
    
    // Check output schema
    const outputSchema = getNodeOutputSchema(nodeType);
    if (outputSchema?.structure?.fields?.[fieldName]) {
      return outputSchema.structure.fields[fieldName];
    }
    
    return 'string'; // Default
  }
  
  /**
   * Check type compatibility
   */
  private isTypeCompatible(sourceType: string, targetType: string): boolean {
    if (sourceType === targetType) return true;
    
    // Compatible type mappings
    const compatibleTypes: Record<string, string[]> = {
      'string': ['string', 'text', 'email', 'url'],
      'number': ['number', 'integer', 'float'],
      'boolean': ['boolean', 'bool'],
      'object': ['object', 'json'],
      'array': ['array', 'list'],
    };
    
    const sourceCompatible = compatibleTypes[sourceType] || [sourceType];
    const targetCompatible = compatibleTypes[targetType] || [targetType];
    
    return sourceCompatible.some(s => targetCompatible.includes(s));
  }
  
  /**
   * Generate template expression for field mapping
   */
  generateTemplateExpression(
    sourceNodeId: string,
    sourceField: string,
    sourceNodeType: string
  ): string {
    // Use standard template format
    return `{{$json.${sourceField}}}`;
  }
}

// Export singleton instance
export const fieldMapper = new FieldMapper();

// Types are already exported above as interfaces, no need to re-export
