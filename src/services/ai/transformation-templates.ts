// Transformation Templates
// Provides reusable configuration templates for common transformation patterns

import { WorkflowNode } from '../../core/types/ai-types';

export interface TransformationProperties {
  inputFields: string[];
  outputFields: string[];
  mappingRules: MappingRule[];
  validationRules?: ValidationRule[];
  errorHandling?: ErrorHandlingConfig;
}

export interface MappingRule {
  source: string;
  target: string;
  transformation: 'direct' | 'format' | 'filter' | 'aggregate' | 'custom';
  condition?: string;
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'format' | 'range' | 'pattern';
  value?: any;
  message?: string;
}

export interface ErrorHandlingConfig {
  onError: 'continue' | 'stop' | 'retry' | 'fallback';
  fallbackValue?: any;
  logErrors: boolean;
  maxRetries?: number;
}

/**
 * Transformation Templates
 * Provides pre-configured templates for common transformation node patterns
 */
export const TransformationTemplates = {
  /**
   * Data Mapping Template
   * Maps fields from input to output with direct transformation
   */
  DataMapping: {
    configuration: {
      mappingType: 'field_mapping',
      inputFields: ['{{previousNode.output}}'],
      outputFields: ['transformed_data'],
      mappingRules: [
        {
          source: '{{inputField}}',
          target: '{{outputField}}',
          transformation: 'direct',
        },
      ],
      preserveUnmapped: true,
      errorHandling: {
        onError: 'continue',
        logErrors: true,
      },
    },
  },

  /**
   * Format Conversion Template
   * Converts data between different formats (JSON, CSV, XML, etc.)
   */
  FormatConverter: {
    configuration: {
      sourceFormat: 'json',
      targetFormat: 'csv',
      fieldSeparator: ',',
      includeHeaders: true,
      encoding: 'utf-8',
      dateFormat: 'ISO',
      errorHandling: {
        onError: 'continue',
        logErrors: true,
      },
    },
  },

  /**
   * Data Filter Template
   * Filters data based on conditions
   */
  DataFilter: {
    configuration: {
      filterConditions: [
        {
          field: '{{fieldName}}',
          operator: 'equals',
          value: '{{filterValue}}',
        },
      ],
      logicalOperator: 'AND',
      caseSensitive: false,
      preserveStructure: true,
      errorHandling: {
        onError: 'continue',
        logErrors: true,
      },
    },
  },

  /**
   * Data Aggregation Template
   * Aggregates data (sum, count, average, etc.)
   */
  DataAggregation: {
    configuration: {
      aggregationType: 'sum',
      groupBy: [],
      operations: [
        {
          field: '{{fieldName}}',
          operation: 'sum',
          alias: 'total',
        },
      ],
      errorHandling: {
        onError: 'continue',
        logErrors: true,
      },
    },
  },

  /**
   * Data Transformation Template
   * Generic transformation with custom logic
   */
  DataTransformation: {
    configuration: {
      transformationType: 'map',
      preserveStructure: true,
      inputMapping: {},
      outputSchema: {},
      transformationRules: [],
      errorHandling: {
        onError: 'continue',
        fallbackValue: null,
        logErrors: true,
      },
    },
  },
};

/**
 * Get transformation template by type
 */
export function getTransformationTemplate(
  nodeType: string,
  previousNode?: WorkflowNode
): Record<string, any> {
  const nodeTypeLower = nodeType.toLowerCase();

  // Map node types to templates
  if (nodeTypeLower.includes('filter')) {
    return TransformationTemplates.DataFilter.configuration;
  }

  if (
    nodeTypeLower.includes('format') ||
    nodeTypeLower.includes('convert') ||
    nodeTypeLower.includes('csv') ||
    nodeTypeLower.includes('json')
  ) {
    return TransformationTemplates.FormatConverter.configuration;
  }

  if (
    nodeTypeLower.includes('aggregate') ||
    nodeTypeLower.includes('sum') ||
    nodeTypeLower.includes('count')
  ) {
    return TransformationTemplates.DataAggregation.configuration;
  }

  if (
    nodeTypeLower.includes('transform') ||
    nodeTypeLower.includes('process') ||
    nodeTypeLower.includes('map')
  ) {
    // Use previous node's output schema if available
    if (previousNode?.data?.config?.outputSchema) {
      return {
        ...TransformationTemplates.DataTransformation.configuration,
        inputMapping: generateInputMappingFromPrevious(previousNode),
        outputSchema: previousNode.data.config.outputSchema,
      };
    }
    return TransformationTemplates.DataTransformation.configuration;
  }

  // Default to generic transformation
  return TransformationTemplates.DataTransformation.configuration;
}

/**
 * Generate input mapping from previous node
 */
function generateInputMappingFromPrevious(
  previousNode: WorkflowNode
): Record<string, string> {
  const mapping: Record<string, string> = {};

  // Try to extract output fields from previous node
  if (previousNode.data?.config?.outputFields) {
    const outputFields = Array.isArray(previousNode.data.config.outputFields)
      ? previousNode.data.config.outputFields
      : [previousNode.data.config.outputFields];

    outputFields.forEach((field: string) => {
      mapping[field] = `{{previousNode.${field}}}`;
    });
  } else {
    // Default mapping
    mapping['data'] = '{{previousNode.output}}';
  }

  return mapping;
}

/**
 * Generate default mapping rules
 */
export function generateDefaultMappingRules(): MappingRule[] {
  return [
    {
      source: '{{input.data}}',
      target: 'output',
      transformation: 'direct',
    },
  ];
}

/**
 * Generate validation rules
 */
export function generateValidationRules(): ValidationRule[] {
  return [
    {
      field: 'data',
      type: 'required',
      message: 'Input data is required',
    },
  ];
}

/**
 * Check if a node type is a transformation node
 */
export function isTransformationNode(nodeType: string): boolean {
  const nodeTypeLower = nodeType.toLowerCase();
  return (
    nodeTypeLower.includes('transform') ||
    nodeTypeLower.includes('process') ||
    nodeTypeLower.includes('filter') ||
    nodeTypeLower.includes('format') ||
    nodeTypeLower.includes('convert') ||
    nodeTypeLower.includes('map') ||
    nodeTypeLower.includes('aggregate')
  );
}
