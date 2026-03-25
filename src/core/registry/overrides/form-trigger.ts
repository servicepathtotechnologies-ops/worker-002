/**
 * ✅ FORM TRIGGER NODE - Migrated to Registry
 * 
 * Form submission trigger.
 * Returns form data.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

export function overrideFormTrigger(
  def: UnifiedNodeDefinition,
  schema: NodeSchema
): UnifiedNodeDefinition {
  const inputSchema = {
    ...def.inputSchema,
    formTitle: def.inputSchema.formTitle
      ? {
          ...def.inputSchema.formTitle,
          fillMode: {
            default: 'buildtime_ai_once' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          ownership: 'structural' as const,
        }
      : def.inputSchema.formTitle,
    fields: def.inputSchema.fields
      ? {
          ...def.inputSchema.fields,
          fillMode: {
            default: 'buildtime_ai_once' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          ownership: 'structural' as const,
          role: 'raw_json' as const,
        }
      : def.inputSchema.fields,
    formDescription: def.inputSchema.formDescription
      ? {
          ...def.inputSchema.formDescription,
          fillMode: {
            default: 'buildtime_ai_once' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          ownership: 'value' as const,
        }
      : def.inputSchema.formDescription,
    submitButtonText: def.inputSchema.submitButtonText
      ? {
          ...def.inputSchema.submitButtonText,
          fillMode: {
            default: 'buildtime_ai_once' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          ownership: 'value' as const,
        }
      : def.inputSchema.submitButtonText,
    successMessage: def.inputSchema.successMessage
      ? {
          ...def.inputSchema.successMessage,
          fillMode: {
            default: 'buildtime_ai_once' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          ownership: 'value' as const,
        }
      : def.inputSchema.successMessage,
    allowMultipleSubmissions: def.inputSchema.allowMultipleSubmissions
      ? {
          ...def.inputSchema.allowMultipleSubmissions,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
          ownership: 'structural' as const,
        }
      : def.inputSchema.allowMultipleSubmissions,
    requireAuthentication: def.inputSchema.requireAuthentication
      ? {
          ...def.inputSchema.requireAuthentication,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
          ownership: 'structural' as const,
        }
      : def.inputSchema.requireAuthentication,
    captcha: def.inputSchema.captcha
      ? {
          ...def.inputSchema.captcha,
          fillMode: {
            default: 'manual_static' as const,
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
          ownership: 'structural' as const,
        }
      : def.inputSchema.captcha,
  };

  return {
    ...def,
    inputSchema,
    execute: async (context) => {
      const { input } = context;
      
      // Extract input object
      const inputObj = typeof input === 'object' && input !== null && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      
      // ✅ OPTIMIZED: Form trigger - return clean form data
      // This matches the Form node implementation - return clean form data
      return {
        success: true,
        output: inputObj.data || {},
      };
    },
  };
}
