/**
 * Error Recovery System
 * 
 * ✅ PHASE 4: Automatic retry and repair for LLM failures
 * 
 * This system:
 * - Automatically retries failed operations
 * - Repairs invalid outputs
 * - Escalates to fallback strategies
 * - Tracks retry attempts
 * - Prevents infinite loops
 * 
 * Architecture Rule:
 * - All errors are recoverable (with fallbacks)
 * - Retries use exponential backoff
 * - Maximum retry attempts enforced
 */

import { SimpleIntent } from './simple-intent';
import { StructuredIntent } from './intent-structurer';
import { llmGuardrails } from './llm-guardrails';
import { outputValidator } from './output-validator';
import { fallbackStrategies } from './fallback-strategies';

export interface RecoveryResult<T> {
  success: boolean;
  result?: T;
  attempts: number;
  errors: string[];
  warnings: string[];
  strategy: string;
}

export interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: number;
  exponentialBackoff?: boolean;
}

export class ErrorRecovery {
  private static instance: ErrorRecovery;
  
  private constructor() {}
  
  static getInstance(): ErrorRecovery {
    if (!ErrorRecovery.instance) {
      ErrorRecovery.instance = new ErrorRecovery();
    }
    return ErrorRecovery.instance;
  }
  
  /**
   * Recover from SimpleIntent extraction failure
   * 
   * Strategy:
   * 1. Retry LLM extraction (with backoff)
   * 2. Use fallback strategies
   * 3. Return minimal intent if all fail
   */
  async recoverSimpleIntent(
    prompt: string,
    llmExtraction: () => Promise<SimpleIntent>,
    options: RetryOptions = {}
  ): Promise<RecoveryResult<SimpleIntent>> {
    const maxAttempts = options.maxAttempts || 3;
    const backoffMs = options.backoffMs || 1000;
    const exponentialBackoff = options.exponentialBackoff !== false;
    
    const errors: string[] = [];
    const warnings: string[] = [];
    let attempts = 0;
    
    // ✅ STRATEGY 1: Retry LLM extraction with backoff
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      
      try {
        // Wait before retry (exponential backoff)
        if (attempt > 1) {
          const waitTime = exponentialBackoff ? backoffMs * Math.pow(2, attempt - 2) : backoffMs;
          await this.sleep(waitTime);
        }
        
        const intent = await llmExtraction();
        
        // Validate intent
        const validation = outputValidator.validateSimpleIntent(intent);
        if (validation.valid) {
          return {
            success: true,
            result: intent,
            attempts,
            errors,
            warnings: [...warnings, ...validation.warnings],
            strategy: 'llm-retry',
          };
        } else {
          // Try to repair
          const schema = llmGuardrails.generateSimpleIntentSchema();
          const guardrailResult = llmGuardrails.validateJSONSchema(intent, schema);
          
          if (guardrailResult.repaired) {
            return {
              success: true,
              result: guardrailResult.repaired,
              attempts,
              errors,
              warnings: [...warnings, 'Intent was repaired'],
              strategy: 'llm-repaired',
            };
          }
          
          errors.push(`Validation failed on attempt ${attempt}: ${validation.errors.join(', ')}`);
        }
      } catch (error) {
        errors.push(`Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // ✅ STRATEGY 2: Use fallback strategies
    warnings.push(`LLM extraction failed after ${maxAttempts} attempts, using fallback`);
    const fallbackResult = await fallbackStrategies.extractSimpleIntentWithFallback(prompt, undefined);
    
    return {
      success: fallbackResult.success,
      result: fallbackResult.result,
      attempts: maxAttempts + 1, // Include fallback attempt
      errors,
      warnings: [...warnings, ...fallbackResult.warnings],
      strategy: fallbackResult.strategy,
    };
  }
  
  /**
   * Recover from StructuredIntent building failure
   * 
   * Strategy:
   * 1. Retry Intent-Aware Planner
   * 2. Use fallback strategies
   * 3. Return minimal StructuredIntent if all fail
   */
  async recoverStructuredIntent(
    simpleIntent: SimpleIntent,
    originalPrompt?: string,
    options: RetryOptions = {}
  ): Promise<RecoveryResult<StructuredIntent>> {
    const maxAttempts = options.maxAttempts || 2;
    const backoffMs = options.backoffMs || 500;
    
    const errors: string[] = [];
    const warnings: string[] = [];
    let attempts = 0;
    
    // ✅ STRATEGY 1: Retry Intent-Aware Planner
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      
      try {
        // Wait before retry
        if (attempt > 1) {
          await this.sleep(backoffMs * attempt);
        }
        
        const { intentAwarePlanner } = await import('./intent-aware-planner');
        const planningResult = await intentAwarePlanner.planWorkflow(simpleIntent, originalPrompt);
        
        if (planningResult.errors.length === 0) {
          // Validate StructuredIntent
          const validation = outputValidator.validateStructuredIntent(planningResult.structuredIntent);
          if (validation.valid) {
            return {
              success: true,
              result: planningResult.structuredIntent,
              attempts,
              errors,
              warnings: [...warnings, ...validation.warnings],
              strategy: 'intent-aware-planner-retry',
            };
          } else {
            errors.push(`Validation failed on attempt ${attempt}: ${validation.errors.join(', ')}`);
          }
        } else {
          errors.push(`Planning failed on attempt ${attempt}: ${planningResult.errors.join(', ')}`);
        }
      } catch (error) {
        errors.push(`Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // ✅ STRATEGY 2: Use fallback strategies
    warnings.push(`Intent-Aware Planner failed after ${maxAttempts} attempts, using fallback`);
    const fallbackResult = await fallbackStrategies.buildStructuredIntentWithFallback(simpleIntent, originalPrompt);
    
    return {
      success: fallbackResult.success,
      result: fallbackResult.result,
      attempts: maxAttempts + 1, // Include fallback attempt
      errors,
      warnings: [...warnings, ...fallbackResult.warnings],
      strategy: fallbackResult.strategy,
    };
  }
  
  /**
   * Recover from LLM output validation failure
   * 
   * Strategy:
   * 1. Repair output using guardrails
   * 2. Retry with repaired output
   * 3. Use fallback if repair fails
   */
  async recoverLLMOutput<T>(
    output: any,
    schema: any,
    fallback: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<RecoveryResult<T>> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let attempts = 0;
    
    // ✅ STRATEGY 1: Try to repair output
    attempts = 1;
    const guardrailResult = llmGuardrails.validateJSONSchema(output, schema);
    
    if (guardrailResult.repaired) {
      // Re-validate repaired output
      const repairedValidation = llmGuardrails.validateJSONSchema(guardrailResult.repaired, schema);
      if (repairedValidation.valid) {
        return {
          success: true,
          result: guardrailResult.repaired as T,
          attempts,
          errors,
          warnings: [...warnings, 'Output was repaired'],
          strategy: 'repair',
        };
      } else {
        errors.push(`Repaired output still invalid: ${repairedValidation.errors.join(', ')}`);
      }
    } else {
      errors.push(`Output validation failed: ${guardrailResult.errors.join(', ')}`);
    }
    
    // ✅ STRATEGY 2: Use fallback
    warnings.push('Output repair failed, using fallback');
    attempts = 2;
    
    try {
      const fallbackResult = await fallback();
      return {
        success: true,
        result: fallbackResult,
        attempts,
        errors,
        warnings: [...warnings, 'Used fallback strategy'],
        strategy: 'fallback',
      };
    } catch (error) {
      errors.push(`Fallback failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        attempts,
        errors,
        warnings,
        strategy: 'failed',
      };
    }
  }
  
  /**
   * Sleep utility for backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Check if error is recoverable
   */
  isRecoverableError(error: Error | string): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorLower = errorMessage.toLowerCase();
    
    // Recoverable errors
    const recoverablePatterns = [
      'timeout',
      'connection',
      'network',
      'rate limit',
      'temporary',
      'retry',
      'invalid json',
      'parse error',
      'validation',
    ];
    
    // Non-recoverable errors
    const nonRecoverablePatterns = [
      'authentication',
      'authorization',
      'permission denied',
      'not found',
      'invalid credentials',
    ];
    
    // Check non-recoverable first
    if (nonRecoverablePatterns.some(pattern => errorLower.includes(pattern))) {
      return false;
    }
    
    // Check recoverable
    return recoverablePatterns.some(pattern => errorLower.includes(pattern));
  }
}

// Export singleton instance
export const errorRecovery = ErrorRecovery.getInstance();
