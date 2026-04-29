import { XMLParser } from 'fast-xml-parser';
import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

function mergeInputs(context: { config?: Record<string, any>; inputs?: Record<string, any> }): Record<string, any> {
  return { ...(context.config || {}), ...(context.inputs || {}) };
}

function readPath(value: any, path: string): any {
  if (!path) return value;
  return path.split('.').filter(Boolean).reduce((current, part) => {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      return Number.isInteger(index) ? current[index] : current.map((item) => item?.[part]);
    }
    return current[part];
  }, value);
}

export function overrideXml(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
  const operationOptions = ['parse', 'extract'].map((value) => ({
    label: value.charAt(0).toUpperCase() + value.slice(1),
    value,
  }));

  return {
    ...def,
    inputSchema: {
      ...def.inputSchema,
      operation: {
        ...def.inputSchema.operation,
        ui: { ...(def.inputSchema.operation?.ui || {}), options: operationOptions },
      },
      path: {
        type: 'string',
        description: 'Dot path used by extract after XML is parsed, e.g. root.item.0.name.',
        required: false,
        role: 'config',
        fillMode: { default: 'buildtime_ai_once', supportsRuntimeAI: false, supportsBuildtimeAI: true },
      },
    },
    execute: async (context) => {
      const inputs = mergeInputs(context);
      const operation = String(inputs.operation || 'parse');
      const xml = String(inputs.xml || inputs.content || '');

      try {
        if (!xml.trim()) throw new Error('xml is required');
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
          textNodeName: '#text',
        });
        const parsed = parser.parse(xml);

        if (operation === 'parse') {
          return { success: true, output: { operation, data: parsed } };
        }

        if (operation === 'extract') {
          const path = String(inputs.path || '').trim();
          return { success: true, output: { operation, path, value: readPath(parsed, path) } };
        }

        throw new Error(`Unsupported XML operation: ${operation}`);
      } catch (error: any) {
        return { success: false, error: { code: 'XML_OPERATION_FAILED', message: error?.message || 'XML operation failed' } };
      }
    },
  };
}
