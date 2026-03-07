/**
 * Data Selector Engine
 * 
 * Automatically selects relevant data from source nodes based on natural language.
 * 
 * Goal:
 * Convert natural language filter conditions into executable filter code.
 * 
 * Example:
 * User prompt: "summarize pending orders"
 * System generates: rows.filter(row => row.status === "pending")
 * 
 * Requirements:
 * - Convert natural language → filter condition
 * - Use LLM for condition generation
 * - Validate against node schema
 * - Support tabular data (arrays of objects)
 * - Run before node execution
 * - Integrate with workflow executor
 */

import { ollamaOrchestrator } from './ai/ollama-orchestrator';
import { getNodeOutputSchema, NODE_OUTPUT_SCHEMAS } from '../core/types/node-output-types';
import { nodeLibrary } from './nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../core/utils/unified-node-type-normalizer';
import { WorkflowNode } from '../core/types/ai-types';

/**
 * Data selection result
 */
export interface DataSelectionResult {
  filterCode: string; // JavaScript filter code
  filterCondition: string; // Human-readable condition
  validated: boolean;
  errors: string[];
  warnings: string[];
  sampleData?: any[]; // Sample data for validation
}

/**
 * Source node information
 */
export interface SourceNodeInfo {
  nodeId: string;
  nodeType: string;
  outputSchema: {
    type: string;
    itemType?: string;
    structure?: {
      fields?: Record<string, string>;
    };
  };
  sampleData?: any[]; // Optional sample data for better condition generation
}

/**
 * Data Selector Class
 */
export class DataSelector {
  private readonly maxRetries = 3;
  private readonly baseTemperature = 0.1;

  /**
   * Generate filter condition from natural language
   * 
   * @param userPrompt - Natural language filter description (e.g., "pending orders", "high priority items")
   * @param sourceNode - Source node that provides the data
   * @param context - Additional context (e.g., full workflow prompt)
   * @returns Filter code and validation results
   */
  async selectData(
    userPrompt: string,
    sourceNode: WorkflowNode,
    context?: {
      fullPrompt?: string;
      sampleData?: any[];
    }
  ): Promise<DataSelectionResult> {
    console.log(`[DataSelector] Selecting data from prompt: "${userPrompt}"`);
    console.log(`[DataSelector] Source node: ${sourceNode.id} (${unifiedNormalizeNodeType(sourceNode)})`);

    // Get source node information
    const sourceInfo = this.getSourceNodeInfo(sourceNode, context?.sampleData);
    
    // Validate source node has array output
    if (sourceInfo.outputSchema.type !== 'array') {
      const error = `Source node "${sourceInfo.nodeType}" does not output array data. Data selection only works with array/tabular data.`;
      console.error(`[DataSelector] ${error}`);
      return {
        filterCode: '',
        filterCondition: '',
        validated: false,
        errors: [error],
        warnings: [],
      };
    }

    // Generate filter condition using LLM
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const isRetry = attempt > 1;
        const temperature = isRetry ? 0.05 : this.baseTemperature;
        
        console.log(`[DataSelector] Attempt ${attempt}/${this.maxRetries} (temperature: ${temperature})`);
        
        // Build prompt for LLM
        const filterPrompt = this.buildFilterPrompt(userPrompt, sourceInfo, context);
        
        // Call Ollama orchestrator
        const response = await ollamaOrchestrator.processRequest('workflow-generation', {
          prompt: filterPrompt,
          system: this.getSystemPrompt(isRetry),
        }, {
          temperature: temperature,
          max_tokens: 500,
          cache: false,
        });

        // Extract content from response
        const rawResponse = typeof response === 'string' 
          ? response 
          : (response?.content || (typeof response === 'object' && response !== null ? JSON.stringify(response) : String(response)));

        if (!rawResponse || rawResponse.trim().length === 0) {
          throw new Error(`Empty response from LLM on attempt ${attempt}`);
        }

        console.log(`[DataSelector] Raw response (attempt ${attempt}):`, rawResponse.substring(0, 200));

        // Parse filter code from response
        const filterCode = this.parseFilterCode(rawResponse);
        
        // Validate filter code
        const validation = await this.validateFilterCode(filterCode, sourceInfo);
        
        if (!validation.valid && attempt < this.maxRetries) {
          console.warn(`[DataSelector] Validation failed (attempt ${attempt}):`, validation.errors);
          lastError = new Error(`Validation failed: ${validation.errors.join(', ')}`);
          await this.delay(1000 * attempt);
          continue;
        }

        console.log(`[DataSelector] Filter code generated successfully`);
        
        return {
          filterCode: filterCode,
          filterCondition: this.extractConditionDescription(rawResponse),
          validated: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          sampleData: context?.sampleData,
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[DataSelector] Attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < this.maxRetries) {
          await this.delay(1000 * attempt);
          continue;
        }
      }
    }

    // Fallback: generate simple filter code
    console.warn(`[DataSelector] All attempts failed, using fallback filter`);
    return this.generateFallbackFilter(userPrompt, sourceInfo);
  }

  /**
   * Get source node information
   */
  private getSourceNodeInfo(sourceNode: WorkflowNode, sampleData?: any[]): SourceNodeInfo {
    const nodeType = unifiedNormalizeNodeType(sourceNode);
    const schema = nodeLibrary.getSchema(nodeType);
    const outputSchema = getNodeOutputSchema(nodeType);

    return {
      nodeId: sourceNode.id,
      nodeType: nodeType,
      outputSchema: {
        type: outputSchema?.type || 'array',
        itemType: outputSchema?.itemType || 'object',
        structure: outputSchema?.structure,
      },
      sampleData: sampleData,
    };
  }

  /**
   * Build prompt for LLM to generate filter condition
   */
  private buildFilterPrompt(
    userPrompt: string,
    sourceInfo: SourceNodeInfo,
    context?: { fullPrompt?: string }
  ): string {
    const sampleDataStr = sourceInfo.sampleData && sourceInfo.sampleData.length > 0
      ? `\n\nSample data structure (first 3 rows):\n${JSON.stringify(sourceInfo.sampleData.slice(0, 3), null, 2)}`
      : '';

    const schemaFields = sourceInfo.outputSchema.structure?.fields
      ? `\n\nExpected data fields: ${Object.keys(sourceInfo.outputSchema.structure.fields).join(', ')}`
      : '';

    return `You are a data filter code generator.

User wants to filter data: "${userPrompt}"

Source node: ${sourceInfo.nodeType}
Output type: ${sourceInfo.outputSchema.type} of ${sourceInfo.outputSchema.itemType}${schemaFields}${sampleDataStr}

${context?.fullPrompt ? `Full workflow context: "${context.fullPrompt}"` : ''}

Generate JavaScript filter code that:
1. Filters an array of objects based on the user's request
2. Uses the variable name "rows" for the input array
3. Returns a filtered array
4. Uses proper JavaScript syntax
5. Handles common field names (status, priority, date, etc.)

Return ONLY the JavaScript filter code, no explanations, no markdown, no code blocks.

Example outputs:
- "rows.filter(row => row.status === 'pending')"
- "rows.filter(row => row.priority === 'high' && row.status !== 'completed')"
- "rows.filter(row => new Date(row.date) > new Date('2024-01-01'))"

Generate the filter code now:`;
  }

  /**
   * Get system prompt for LLM
   */
  private getSystemPrompt(isRetry: boolean): string {
    if (isRetry) {
      return `You are a JavaScript code generator. Generate ONLY valid JavaScript filter code. No explanations, no markdown, no code blocks. Return code that can be executed directly.`;
    }
    return `You are a data filter code generator. Convert natural language filter requests into JavaScript filter code. Return only the code, no explanations.`;
  }

  /**
   * Parse filter code from LLM response
   */
  private parseFilterCode(response: string): string {
    let code = response.trim();

    // Remove markdown code blocks
    if (code.includes('```javascript')) {
      const match = code.match(/```javascript\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        code = match[1].trim();
      }
    } else if (code.includes('```')) {
      const match = code.match(/```\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        code = match[1].trim();
      }
    }

    // Remove leading/trailing quotes if present
    code = code.replace(/^["'`]+|["'`]+$/g, '').trim();

    // Extract filter expression (look for .filter( pattern)
    const filterMatch = code.match(/(rows\s*\.\s*filter\s*\([^)]+\))/);
    if (filterMatch) {
      code = filterMatch[1];
    }

    return code;
  }

  /**
   * Validate filter code against source schema
   */
  private async validateFilterCode(
    filterCode: string,
    sourceInfo: SourceNodeInfo
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic syntax validation
    if (!filterCode || filterCode.trim().length === 0) {
      errors.push('Filter code is empty');
      return { valid: false, errors, warnings };
    }

    // Check if it's a filter expression
    if (!filterCode.includes('.filter(')) {
      errors.push('Filter code must contain .filter() method');
      return { valid: false, errors, warnings };
    }

    // Check if it uses 'rows' variable
    if (!filterCode.includes('rows')) {
      warnings.push('Filter code should use "rows" variable for input array');
    }

    // Try to validate syntax (basic check)
    try {
      // Create a test function to validate syntax
      const testFunction = new Function('rows', `return ${filterCode}`);
      
      // Test with sample data if available
      if (sourceInfo.sampleData && sourceInfo.sampleData.length > 0) {
        try {
          const testResult = testFunction(sourceInfo.sampleData);
          if (!Array.isArray(testResult)) {
            errors.push('Filter code must return an array');
          }
        } catch (testError) {
          errors.push(`Filter code execution error: ${testError instanceof Error ? testError.message : String(testError)}`);
        }
      }
    } catch (syntaxError) {
      errors.push(`Invalid JavaScript syntax: ${syntaxError instanceof Error ? syntaxError.message : String(syntaxError)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Extract human-readable condition description
   */
  private extractConditionDescription(response: string): string {
    // Try to extract description from response
    const descMatch = response.match(/(?:condition|filter|selects?)[:\s]+(.+?)(?:\n|$)/i);
    if (descMatch) {
      return descMatch[1].trim();
    }
    
    // Fallback: use first line or first 100 chars
    const firstLine = response.split('\n')[0].trim();
    return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
  }

  /**
   * Generate fallback filter code
   */
  private generateFallbackFilter(
    userPrompt: string,
    sourceInfo: SourceNodeInfo
  ): DataSelectionResult {
    console.warn(`[DataSelector] Generating fallback filter for: "${userPrompt}"`);

    const promptLower = userPrompt.toLowerCase();
    let filterCode = 'rows.filter(row => true)'; // Default: no filter

    // Simple keyword-based fallback
    if (promptLower.includes('pending')) {
      filterCode = "rows.filter(row => row.status === 'pending' || row.status === 'Pending')";
    } else if (promptLower.includes('completed')) {
      filterCode = "rows.filter(row => row.status === 'completed' || row.status === 'Completed')";
    } else if (promptLower.includes('high') && promptLower.includes('priority')) {
      filterCode = "rows.filter(row => row.priority === 'high' || row.priority === 'High')";
    } else if (promptLower.includes('active')) {
      filterCode = "rows.filter(row => row.status === 'active' || row.active === true)";
    }

    return {
      filterCode: filterCode,
      filterCondition: `Fallback filter: ${userPrompt}`,
      validated: true,
      errors: [],
      warnings: ['Used fallback filter generation - may not be accurate'],
      sampleData: sourceInfo.sampleData,
    };
  }

  /**
   * Apply filter to data
   * Can be used to test filter code before execution
   */
  applyFilter(data: any[], filterCode: string): any[] {
    try {
      const filterFunction = new Function('rows', `return ${filterCode}`);
      const result = filterFunction(data);
      
      if (!Array.isArray(result)) {
        throw new Error('Filter code must return an array');
      }
      
      return result;
    } catch (error) {
      console.error(`[DataSelector] Error applying filter:`, error);
      throw new Error(`Failed to apply filter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate JavaScript node config with filter code
   * Useful for integrating with workflow executor
   */
  generateFilterNodeConfig(filterCode: string, sourceNodeId: string): {
    type: string;
    config: Record<string, any>;
  } {
    // Wrap filter code in a JavaScript node configuration
    const jsCode = `
// Filter data from ${sourceNodeId}
const inputData = $input;
const rows = Array.isArray(inputData) ? inputData : (inputData?.rows || inputData?.data || []);
const filtered = ${filterCode};
return filtered;
`.trim();

    return {
      type: 'javascript',
      config: {
        code: jsCode,
        inputData: `{{$json}}`, // Reference to source node output
      },
    };
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const dataSelector = new DataSelector();

// Types are already exported above, no need to re-export
