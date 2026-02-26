/**
 * Auto-register NodeDefinitions from NodeLibrary (schemas are the source of truth).
 *
 * This bridges the existing comprehensive NodeLibrary (schema/capabilities) into the
 * unified NodeDefinitionRegistry contract used by:
 * - /api/node-definitions (frontend schema-driven UI)
 * - core workflow validation
 *
 * IMPORTANT:
 * - Hand-written definitions in `worker/src/nodes/definitions/*.ts` take precedence.
 * - This module only fills gaps (missing node types).
 */

import { nodeDefinitionRegistry, NodeDefinition, NodeInputSchema, NodeOutputSchema } from '../../core/types/node-definition';
import { NodeLibrary, NodeSchema } from '../../services/nodes/node-library';

function inferCredentialFields(nodeType: string, inputSchema: NodeInputSchema): string[] {
  // Conservative heuristic: treat common patterns as credential fields
  // (real OAuth connections are handled outside node config; this is mostly for API key style nodes).
  const credentialPatterns = [
    'oauth',
    'client_id',
    'client_secret',
    'token',
    'secret',
    'api_key',
    'apikey',
    'access_token',
    'refresh_token',
    'credential',
    'password',
    'username',
    'host',
  ];

  const fields = Object.keys(inputSchema);
  const inferred = fields.filter((f) => credentialPatterns.some((p) => f.toLowerCase().includes(p)));

  // Explicitly NOT credentials for Gmail (inputs)
  if (nodeType === 'google_gmail') {
    return inferred.filter((f) => !['to', 'subject', 'body', 'from'].includes(f.toLowerCase()));
  }

  return inferred;
}

function toNodeDefinition(schema: NodeSchema): NodeDefinition {
  const required = schema.configSchema?.required || [];
  const optional = schema.configSchema?.optional || {};

  const inputSchema: NodeInputSchema = {};
  for (const [k, v] of Object.entries(optional)) {
    inputSchema[k] = {
      type: (v as any).type === 'expression' ? 'string' : (v as any).type,
      description: (v as any).description || '',
      required: required.includes(k),
      default: (v as any).default,
      examples: (v as any).examples,
      validation: (v as any).validation,
      ui: {
        options: (v as any).options,
        requiredIf: (v as any).requiredIf,
        widget: (v as any)?.requiredIf?.field?.toLowerCase?.().includes('recipient')
          ? 'multi_email'
          : undefined,
      },
    };
  }

  // Output schema: use NodeLibrary's explicit outputSchema when present; otherwise default.
  const outputSchema: NodeOutputSchema =
    (schema as any).outputSchema && typeof (schema as any).outputSchema === 'object'
      ? (schema as any).outputSchema
      : ({
          default: { type: 'object', description: 'Default output' },
        } as NodeOutputSchema);

  // Ports: minimal defaults. (Branching nodes should be explicitly defined in `nodes/definitions`.)
  const isBranching = schema.type === 'if_else' || schema.type === 'switch' || schema.type === 'loop';
  const outgoingPorts = schema.type === 'if_else' ? ['true', 'false'] : ['default'];
  const incomingPorts = ['default'];

  const credentialFields = inferCredentialFields(schema.type, inputSchema);

  const defaultInputs = () => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(inputSchema)) {
      if (v.default !== undefined) out[k] = v.default;
    }
    return out;
  };

  const validateInputs = (inputs: Record<string, any>) => {
    const errors: string[] = [];

    // Required checks
    for (const k of required) {
      const v = inputs?.[k];
      if (v === undefined || v === null || v === '') {
        errors.push(`${k} is required`);
      }
    }

    // Field-level validation hooks
    for (const [k, spec] of Object.entries(inputSchema)) {
      const v = inputs?.[k];
      if (v === undefined || v === null || v === '') continue;
      if (spec.validation) {
        const res = spec.validation(v);
        if (res !== true) {
          errors.push(typeof res === 'string' ? res : `${k} is invalid`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  };

  return {
    type: schema.type,
    label: schema.label,
    category: schema.category,
    description: schema.description,
    icon: (schema as any).icon,
    version: 1,
    inputSchema,
    outputSchema,
    requiredInputs: required,
    outgoingPorts,
    incomingPorts,
    isBranching,
    validateInputs,
    defaultInputs,
    credentialSchema: {
      providers: schema.providers || [],
      required: credentialFields,
    },
    // Execution is implemented elsewhere for now. Runtime executor will fall back to legacy.
  };
}

export function registerNodeDefinitionsFromNodeLibrary(): void {
  const lib = new NodeLibrary();
  const schemas = lib.getAllSchemas();

  for (const schema of schemas) {
    if (!schema?.type) continue;
    // Respect hand-written definitions
    if (nodeDefinitionRegistry.get(schema.type)) continue;
    nodeDefinitionRegistry.register(toNodeDefinition(schema));
  }
}

