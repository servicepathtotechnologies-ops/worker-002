/**
 * Shared stage-to-progress mapping for the AiFirstPipeline.
 * This is the single source of truth for stage progress percentages and log labels,
 * used by both the backend emitter and (optionally) the frontend parser.
 */

export const STAGE_PROGRESS_MAP: Record<string, number> = {
  intent:               10,
  capability_selection: 18,
  structural_prompt:    28,
  node_selection:       40,
  edge_reasoning:       50,
  validation:           62,
  property_population:  74,
  credential_discovery: 85,
  field_ownership:      93,
};

export const STAGE_LOG_LABELS: Record<string, string> = {
  intent:               'Extracting intent...',
  capability_selection: 'Preparing capability options...',
  structural_prompt:    'Building structural blueprint...',
  node_selection:       'Selecting workflow nodes...',
  edge_reasoning:       'Reasoning about edges...',
  validation:           'Validating graph structure...',
  property_population:  'Populating node properties...',
  credential_discovery: 'Discovering credentials...',
  field_ownership:      'Assigning field ownership...',
};

/**
 * Pipeline execution order — the 8 stage names in the order they run.
 * Exported for use in property-based tests.
 */
export const PIPELINE_STAGE_ORDER: readonly string[] = [
  'intent',
  'capability_selection',
  'structural_prompt',
  'node_selection',
  'edge_reasoning',
  'validation',
  'property_population',
  'credential_discovery',
  'field_ownership',
] as const;

/**
 * Returns the progress percentage for a known stage name.
 * Falls back to 5 (non-zero) for unknown stage names.
 */
export function getStageProgress(stageName: string): number {
  return STAGE_PROGRESS_MAP[stageName] ?? 5;
}
