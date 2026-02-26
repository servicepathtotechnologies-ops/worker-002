/**
 * Phase 3: Validation Middleware
 * 
 * Integrates Zod validation into workflow execution.
 * Provides validation at key boundaries:
 * 1. Node configuration validation (before execution)
 * 2. Node input validation (optional, before processing)
 * 3. Node output validation (optional, after execution)
 * 4. Template resolution validation (when resolving templates)
 */

import {
  validateNodeConfig,
  validateNodeInput,
  validateNodeOutput,
  formatValidationError,
  ValidationResult,
  ValidationError,
  hasNodeSchema,
} from './node-schemas';

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Enable node configuration validation (default: true) */
  validateConfig?: boolean;
  /** Enable node input validation (default: false - can be slow) */
  validateInput?: boolean;
  /** Enable node output validation (default: false - can be slow) */
  validateOutput?: boolean;
  /** Enable template resolution validation (default: true) */
  validateTemplates?: boolean;
  /** Strict mode: fail on validation errors (default: false - log and continue) */
  strict?: boolean;
  /** Environment: 'development' enables more verbose errors (default: 'production') */
  environment?: 'development' | 'production';
}

/**
 * Default validation options
 */
const DEFAULT_OPTIONS: ValidationOptions = {
  validateConfig: true,
  validateInput: false,
  validateOutput: false,
  validateTemplates: true,
  strict: false,
  environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
};

/**
 * Validation middleware for node execution
 */
export class ValidationMiddleware {
  private options: ValidationOptions;
  private validationErrors: ValidationError[] = [];

  constructor(options: Partial<ValidationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Validate node configuration before execution
   */
  validateConfig<T>(
    nodeType: string,
    config: unknown,
    nodeId?: string
  ): ValidationResult<T> {
    if (!this.options.validateConfig) {
      return { success: true, data: config as T };
    }

    const result = validateNodeConfig<T>(nodeType, config, nodeId);

    if (!result.success && result.error) {
      this.handleValidationError(result.error, 'config');
    }

    return result;
  }

  /**
   * Validate node input before processing
   */
  validateInput(input: unknown): ValidationResult<Record<string, unknown>> {
    if (!this.options.validateInput) {
      return { success: true, data: input as Record<string, unknown> };
    }

    const result = validateNodeInput(input);

    if (!result.success && result.error) {
      this.handleValidationError(result.error, 'input');
    }

    return result;
  }

  /**
   * Validate node output after execution
   */
  validateOutput(output: unknown): ValidationResult<unknown> {
    if (!this.options.validateOutput) {
      return { success: true, data: output };
    }

    const result = validateNodeOutput(output);

    if (!result.success && result.error) {
      this.handleValidationError(result.error, 'output');
    }

    return result;
  }

  /**
   * Check if a template value is valid
   */
  validateTemplateValue(
    template: string,
    value: unknown,
    context: Record<string, unknown>
  ): { valid: boolean; error?: string } {
    if (!this.options.validateTemplates) {
      return { valid: true };
    }

    // Basic validation: check if template resolved to undefined when it shouldn't
    if (value === undefined && !template.includes('undefined')) {
      // Check if the path exists in context
      const path = this.extractTemplatePath(template);
      if (path && !this.pathExistsInContext(path, context)) {
        return {
          valid: false,
          error: `Template '${template}' references non-existent field '${path}'. Available fields: ${this.getAvailableFields(context).join(', ')}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Handle validation error (log or throw based on strict mode)
   */
  private handleValidationError(error: ValidationError, type: 'config' | 'input' | 'output'): void {
    this.validationErrors.push(error);

    const formattedError = formatValidationError(error);
    const logMessage = `[Validation ${type.toUpperCase()}] ${formattedError}`;

    if (this.options.environment === 'development') {
      console.error(logMessage);
      if (error.suggestions) {
        console.error('Suggestions:', error.suggestions);
      }
    } else {
      console.warn(logMessage);
    }

    if (this.options.strict) {
      throw new Error(formattedError);
    }
  }

  /**
   * Extract template path from template string
   * Example: "{{node.field}}" -> "node.field"
   */
  private extractTemplatePath(template: string): string | null {
    const match = template.match(/\{\{([^}]+)\}\}/);
    return match ? match[1].trim() : null;
  }

  /**
   * Check if a path exists in context
   */
  private pathExistsInContext(path: string, context: Record<string, unknown>): boolean {
    const keys = path.split('.');
    let current: unknown = context;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return false;
      }
      if (typeof current !== 'object') {
        return false;
      }
      if (!(key in (current as Record<string, unknown>))) {
        return false;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return true;
  }

  /**
   * Get available fields from context (for error messages)
   */
  private getAvailableFields(context: Record<string, unknown>, maxFields: number = 10): string[] {
    const fields: string[] = [];
    
    for (const key in context) {
      if (fields.length >= maxFields) {
        fields.push('...');
        break;
      }
      fields.push(key);
    }

    return fields;
  }

  /**
   * Get all validation errors encountered
   */
  getErrors(): ValidationError[] {
    return [...this.validationErrors];
  }

  /**
   * Clear validation errors
   */
  clearErrors(): void {
    this.validationErrors = [];
  }

  /**
   * Get validation statistics
   */
  getStats(): {
    totalErrors: number;
    configErrors: number;
    inputErrors: number;
    outputErrors: number;
    nodesWithSchemas: number;
    nodesWithoutSchemas: number;
  } {
    // Track error types by checking which validation method was called
    // We'll use a simple approach: check if error has nodeType (config) or not
    const configErrors = this.validationErrors.filter(e => e.nodeType !== undefined).length;
    const inputErrors = this.validationErrors.filter(e => e.field === 'input').length;
    const outputErrors = this.validationErrors.filter(e => e.field === 'output').length;
    
    return {
      totalErrors: this.validationErrors.length,
      configErrors,
      inputErrors,
      outputErrors,
      nodesWithSchemas: 0, // Would need to track this separately
      nodesWithoutSchemas: 0, // Would need to track this separately
    };
  }

  /**
   * Check if node type has validation schema
   */
  hasSchema(nodeType: string): boolean {
    return hasNodeSchema(nodeType);
  }
}

/**
 * Global validation middleware instance
 * Can be configured via environment variables or constructor
 */
export const validationMiddleware = new ValidationMiddleware({
  validateConfig: process.env.VALIDATE_NODE_CONFIG !== 'false',
  validateInput: process.env.VALIDATE_NODE_INPUT === 'true',
  validateOutput: process.env.VALIDATE_NODE_OUTPUT === 'true',
  validateTemplates: process.env.VALIDATE_TEMPLATES !== 'false',
  strict: process.env.VALIDATION_STRICT === 'true',
  environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
});
