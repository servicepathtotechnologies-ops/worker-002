import { WorkflowSpec } from '../planner/types';

const REQUIRED_KEYS: Array<keyof WorkflowSpec> = [
  'trigger',
  'data_sources',
  'actions',
  'storage',
  'transformations',
  'mentioned_only',
  'entities',
  'fields',
  'clarifications',
];

export function validateWorkflowSpec(raw: unknown): WorkflowSpec {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('WorkflowSpec must be an object');
  }

  // Treat the incoming value as a WorkflowSpec for the remainder of this function.
  // All necessary runtime shape checks are performed below.
  const spec = raw as WorkflowSpec;
  const specObject = raw as Record<string, unknown>;

  // Ensure no unknown top-level fields (defensive)
  const allowedKeys = new Set(REQUIRED_KEYS);
  for (const key of Object.keys(specObject)) {
    if (!allowedKeys.has(key as keyof WorkflowSpec)) {
      throw new Error(`Unknown field in WorkflowSpec: ${key}`);
    }
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in specObject)) {
      throw new Error(`Missing required field in WorkflowSpec: ${key}`);
    }
  }

  // Type checks
  const trigger = spec.trigger;
  if (trigger !== 'manual' && trigger !== 'schedule' && trigger !== 'webhook' && trigger !== 'event') {
    throw new Error(`Invalid trigger value: ${trigger}`);
  }

  const arrayKeys: Array<keyof WorkflowSpec> = [
    'data_sources',
    'actions',
    'storage',
    'transformations',
    'mentioned_only',
    'entities',
    'fields',
    'clarifications',
  ];

  for (const key of arrayKeys) {
    const value = spec[key];
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
      throw new Error(`Field ${key} must be an array of strings`);
    }
  }

  return spec;
}

export default {
  validateWorkflowSpec,
};

