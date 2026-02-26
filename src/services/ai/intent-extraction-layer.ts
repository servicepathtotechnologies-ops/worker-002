/**
 * Intent Extraction Layer
 * 
 * STEP 1: Parse user prompt into semantic operations.
 * 
 * Converts natural language into structured semantic operations:
 * 
 * Example:
 * "get data from sheets, summarize, send email"
 * →
 * [
 *   {type:"fetch_data", source:"google_sheets"},
 *   {type:"transform", operation:"summarize"},
 *   {type:"send", destination:"gmail"}
 * ]
 * 
 * This is a deterministic parser - no heuristic guessing.
 */

import { StructuredIntent } from './intent-structurer';
import { transformationDetector, TransformationDetection } from './transformation-detector';

export enum SemanticOperationType {
  FETCH_DATA = 'fetch_data',
  TRANSFORM = 'transform',
  SEND = 'send',
  STORE = 'store',
  CONDITION = 'condition',
  LOOP = 'loop',
}

export interface SemanticOperation {
  type: SemanticOperationType;
  source?: string;        // For fetch_data: where to fetch from
  destination?: string;   // For send/store: where to send/store
  operation?: string;      // For transform: what transformation
  condition?: string;      // For condition: condition expression
  config?: Record<string, any>;
  order: number;           // Execution order (0-based)
}

export interface ExtractedIntent {
  operations: SemanticOperation[];
  trigger: string;
  metadata: {
    originalPrompt: string;
    extractedAt: string;
  };
}

/**
 * Intent Extraction Layer
 * Parses user prompt into semantic operations
 */
export class IntentExtractionLayer {
  /**
   * Extract semantic operations from structured intent
   * 
   * @param intent - Structured intent from user prompt
   * @param originalPrompt - Original user prompt (for metadata)
   * @returns Extracted intent with semantic operations
   */
  extractOperations(intent: StructuredIntent, originalPrompt: string): ExtractedIntent {
    console.log('[IntentExtractionLayer] Extracting semantic operations from intent...');
    
    // STEP 0: Detect transformation verbs in original prompt
    const transformationDetection = transformationDetector.detectTransformations(originalPrompt);
    
    const operations: SemanticOperation[] = [];
    let order = 0;
    
    // STEP 1: Extract fetch_data operations
    const fetchOperations = this.extractFetchOperations(intent, order);
    operations.push(...fetchOperations);
    order += fetchOperations.length;
    
    // STEP 2: Extract transform operations
    let transformOperations = this.extractTransformOperations(intent, order);
    
    // STEP 2.1: If transformation detected in prompt but not in intent, add it
    if (transformationDetection.detected && transformOperations.length === 0) {
      console.log(`[IntentExtractionLayer] ⚠️  Transformation verbs detected in prompt but not in intent. Adding transformation operations...`);
      
      for (const verb of transformationDetection.verbs) {
        const recommendedNode = transformationDetector.getRecommendedNodeType(verb);
        if (recommendedNode) {
          transformOperations.push({
            type: SemanticOperationType.TRANSFORM,
            operation: verb,
            config: {
              detectedFromPrompt: true,
              recommendedNodeType: recommendedNode,
            },
            order: order + transformOperations.length,
          });
          console.log(`[IntentExtractionLayer] ✅ Added transformation operation: ${verb} → ${recommendedNode}`);
        }
      }
    }
    
    operations.push(...transformOperations);
    order += transformOperations.length;
    
    // STEP 3: Extract send operations
    const sendOperations = this.extractSendOperations(intent, order);
    operations.push(...sendOperations);
    order += sendOperations.length;
    
    // STEP 4: Extract store operations
    const storeOperations = this.extractStoreOperations(intent, order);
    operations.push(...storeOperations);
    order += storeOperations.length;
    
    // STEP 5: Extract conditional operations
    const conditionOperations = this.extractConditionOperations(intent, order);
    operations.push(...conditionOperations);
    order += conditionOperations.length;
    
    // Sort by order to ensure correct sequence
    operations.sort((a, b) => a.order - b.order);
    
    console.log(`[IntentExtractionLayer] ✅ Extracted ${operations.length} semantic operations:`);
    operations.forEach(op => {
      console.log(`[IntentExtractionLayer]   ${op.order}. ${op.type}${op.source ? ` (source: ${op.source})` : ''}${op.destination ? ` (destination: ${op.destination})` : ''}${op.operation ? ` (operation: ${op.operation})` : ''}`);
    });
    
    return {
      operations,
      trigger: intent.trigger || 'manual_trigger',
      metadata: {
        originalPrompt: originalPrompt,
        extractedAt: new Date().toISOString(),
      },
    };
  }
  
  /**
   * Extract fetch_data operations
   */
  private extractFetchOperations(intent: StructuredIntent, startOrder: number): SemanticOperation[] {
    const operations: SemanticOperation[] = [];
    const dataSourceKeywords = ['read', 'get', 'fetch', 'retrieve', 'load', 'pull'];
    
    intent.actions?.forEach((action, index) => {
      const operation = action.operation.toLowerCase();
      const type = action.type.toLowerCase();
      
      // Check if this is a data source operation
      if (dataSourceKeywords.includes(operation) || this.isDataSourceType(type)) {
        operations.push({
          type: SemanticOperationType.FETCH_DATA,
          source: type,
          config: action.config || {},
          order: startOrder + index,
        });
      }
    });
    
    return operations;
  }
  
  /**
   * Extract transform operations
   */
  private extractTransformOperations(intent: StructuredIntent, startOrder: number): SemanticOperation[] {
    const operations: SemanticOperation[] = [];
    const transformKeywords = ['process', 'transform', 'analyze', 'summarize', 'classify', 'format', 'parse'];
    
    intent.actions?.forEach((action, index) => {
      const operation = action.operation.toLowerCase();
      const type = action.type.toLowerCase();
      
      // Check if this is a transformation operation
      if (transformKeywords.includes(operation) || 
          transformKeywords.some(keyword => type.includes(keyword)) ||
          this.isTransformationType(type)) {
        operations.push({
          type: SemanticOperationType.TRANSFORM,
          operation: type,
          config: action.config || {},
          order: startOrder + index,
        });
      }
    });
    
    return operations;
  }
  
  /**
   * Extract send operations
   */
  private extractSendOperations(intent: StructuredIntent, startOrder: number): SemanticOperation[] {
    const operations: SemanticOperation[] = [];
    const sendKeywords = ['send', 'post', 'notify', 'publish', 'deliver'];
    
    intent.actions?.forEach((action, index) => {
      const operation = action.operation.toLowerCase();
      const type = action.type.toLowerCase();
      
      // Check if this is a send operation
      if (sendKeywords.includes(operation) || this.isOutputType(type)) {
        operations.push({
          type: SemanticOperationType.SEND,
          destination: type,
          config: action.config || {},
          order: startOrder + index,
        });
      }
    });
    
    return operations;
  }
  
  /**
   * Extract store operations
   */
  private extractStoreOperations(intent: StructuredIntent, startOrder: number): SemanticOperation[] {
    const operations: SemanticOperation[] = [];
    const storeKeywords = ['write', 'save', 'store', 'persist', 'update'];
    
    intent.actions?.forEach((action, index) => {
      const operation = action.operation.toLowerCase();
      const type = action.type.toLowerCase();
      
      // Check if this is a store operation
      if (storeKeywords.includes(operation) && this.isDataSourceType(type)) {
        operations.push({
          type: SemanticOperationType.STORE,
          destination: type,
          config: action.config || {},
          order: startOrder + index,
        });
      }
    });
    
    return operations;
  }
  
  /**
   * Extract conditional operations
   */
  private extractConditionOperations(intent: StructuredIntent, startOrder: number): SemanticOperation[] {
    const operations: SemanticOperation[] = [];
    
    intent.conditions?.forEach((condition, index) => {
      operations.push({
        type: SemanticOperationType.CONDITION,
        condition: condition.condition,
        config: {
          true_path: condition.true_path,
          false_path: condition.false_path,
        },
        order: startOrder + index,
      });
    });
    
    return operations;
  }
  
  /**
   * Check if type is a data source
   */
  private isDataSourceType(type: string): boolean {
    const dataSourceTypes = [
      'google_sheets', 'sheets', 'spreadsheet',
      'postgresql', 'postgres', 'mysql', 'mongodb', 'database',
      'aws_s3', 's3', 'dropbox', 'storage',
      'airtable', 'notion', 'csv', 'excel',
      'google_drive', 'drive',
    ];
    
    return dataSourceTypes.some(dsType => type.includes(dsType));
  }
  
  /**
   * Check if type is a transformation
   */
  private isTransformationType(type: string): boolean {
    const transformationTypes = [
      'summarize', 'summary', 'summarizer',
      'classify', 'classification',
      'transform', 'format', 'parse', 'filter', 'map', 'reduce',
      'ai', 'llm', 'process',
      'ollama', 'openai', 'anthropic', 'gemini',
    ];
    
    return transformationTypes.some(transType => type.includes(transType));
  }
  
  /**
   * Check if type is an output
   */
  private isOutputType(type: string): boolean {
    const outputTypes = [
      'gmail', 'email', 'mail',
      'slack', 'discord', 'telegram',
      'notification', 'notify',
      'webhook', 'http_request', 'api',
    ];
    
    return outputTypes.some(outType => type.includes(outType));
  }
}

// Export singleton instance
export const intentExtractionLayer = new IntentExtractionLayer();

// Export convenience function
export function extractSemanticOperations(intent: StructuredIntent, originalPrompt: string): ExtractedIntent {
  return intentExtractionLayer.extractOperations(intent, originalPrompt);
}
