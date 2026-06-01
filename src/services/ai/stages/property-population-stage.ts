/**
 * Property Population Stage — AI-First Pipeline (Stage 6)
 *
 * Calls an LLM once per node to populate every field whose
 * `fillMode.default` is `buildtime_ai_once`, using the user's original
 * intent, the structural blueprint, and the node's inputSchema as context.
 *
 * The stage is soft-failing: LLM errors per node fall back to registry
 * defaults without blocking the pipeline. The stage NEVER returns ok: false.
 *
 * CRITICAL constraints:
 * - NEVER mutates workflow.edges
 * - NEVER calls any unifiedGraphOrchestrator method
 * - All node config changes go to node.data.config only
 *
 * Requirements: 1.1–1.5, 2.1–2.5, 3.1–3.6, 4.1–4.6, 5.1, 6.1–6.3, 7.1–7.5
 */

import { geminiOrchestrator } from '../gemini-orchestrator';
import { logger } from '../../../core/logger';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import type { Workflow } from '../../../core/types/ai-types';
import type { NodeInputField } from '../../../core/types/unified-node-contract';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PropertyPopulationStageInput {
  workflow: Workflow;
  userIntent: string;
  structuralPrompt: string;
  correlationId?: string;
}

export interface PropertyPopulationStageResult {
  ok: true;
  workflow: Workflow;
  /** Maps nodeId → list of field names that were AI-populated (only nodes with ≥1 written field) */
  propertyPopulationSummary: Record<string, string[]>;
  durationMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/** Compact ordered id→type list from current workflow (no registry branching logic). */
function buildCompactGraphDigest(workflow: Workflow): string {
  return workflow.nodes
    .map((n, i) => {
      const t = n.type ?? n.data?.type ?? '?';
      return `${i + 1}. ${n.id}: ${t}`;
    })
    .join('\n');
}

/** True when the stored value equals the registry default — no explicit choice was made yet. */
function isAtRegistryDefault(storedValue: unknown, fieldDefault: unknown): boolean {
  if (storedValue === undefined || storedValue === null) return true;
  if (fieldDefault === undefined || fieldDefault === null) return false;
  try {
    return JSON.stringify(storedValue) === JSON.stringify(fieldDefault);
  } catch {
    return storedValue === fieldDefault;
  }
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(cleaned.substring(start, end + 1));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Per-Field Directive Generation ─────────────────────────────────────────

/**
 * Generates per-field behavioral directives for every runtime_ai field in a node.
 * Called once per node during property population (build time).
 * Stored in node.data.config._fieldDirectives and used at execution time by
 * the AI input resolver to produce semantically correct per-field content.
 *
 * Universal: works for any node type via registry field metadata (type, role, description).
 * Non-blocking: returns {} on any failure.
 */
async function generateRuntimeFieldDirectives(params: {
  nodeId: string;
  nodeType: string;
  runtimeAiFields: Array<{ fieldName: string; field: NodeInputField }>;
  userIntent: string;
  graphDigest: string;
  upstreamFieldNames?: string[];
  correlationId?: string;
}): Promise<Record<string, string>> {
  const { nodeId, nodeType, runtimeAiFields, userIntent, graphDigest, upstreamFieldNames, correlationId } = params;

  if (runtimeAiFields.length === 0) return {};

  const systemPrompt =
    'You are a workflow field directive generator. For each listed runtime_ai field, ' +
    'write a precise 1-2 sentence instruction that tells an AI what this field must contain ' +
    'at workflow execution time and what it must never contain.\n\n' +
    'RULES:\n' +
    '- title_like fields: instruct to write a concise human-readable label/subject (max 100 chars). ' +
    'Never use spreadsheet ranges, row identifiers, or structural system keys as the value.\n' +
    '- long_body fields: instruct to write professional prose derived from BUSINESS DATA ' +
    '(form values, names, submitted text). Never use integration identifiers ' +
    '(spreadsheet ranges like "job!A1:E2", row counts, API endpoints) as greeting names or body content.\n' +
    '- recipient fields: instruct to extract a valid email address or identifier from upstream ' +
    'form data using the specific upstream field name. Never substitute a sheet name or range.\n' +
    '- values/data/payload fields: instruct to build a structured payload using the upstream field ' +
    'names provided (e.g. [[{{$json.Name}}, {{$json.Email}}]] for an array row, or an object for ' +
    'key-value pairs). Reference ONLY the upstream field names listed in UPSTREAM_FIELDS.\n' +
    '- Other fields: write a directive based on the field\'s description and semantic role.\n\n' +
    'Return ONLY valid JSON: { "<fieldName>": "<directive string>" }. No markdown, no explanation.';

  const fieldsSection = runtimeAiFields
    .map(
      ({ fieldName, field }) =>
        `  - ${fieldName} (type: ${field.type}, role: ${field.role ?? 'unspecified'}): ${field.description}`,
    )
    .join('\n');

  const upstreamSection =
    upstreamFieldNames && upstreamFieldNames.length > 0
      ? `\nUPSTREAM_FIELDS (reference these by name at runtime using {{$json.<name>}}):\n` +
        upstreamFieldNames.map((f) => `  - ${f}`).join('\n') + '\n'
      : '';

  const userMessage =
    `USER_INTENT:\n${userIntent}\n\n` +
    `WORKFLOW_NODE_ORDER:\n${graphDigest}\n\n` +
    `NODE_TYPE: ${nodeType}\n` +
    `NODE_ID: ${nodeId}\n` +
    upstreamSection +
    `\nFIELDS NEEDING DIRECTIVES:\n${fieldsSection}\n\n` +
    `Return a JSON object with exactly these field names as keys and directive strings as values.`;

  try {
    const result = await geminiOrchestrator.processRequest(
      'field-directive-generation',
      { system: systemPrompt, message: userMessage },
      { model: 'gemini-3.5-flash', temperature: 0.1, cache: false },
    );
    const raw = typeof result === 'string' ? result : JSON.stringify(result);
    const parsed = tryParseJson(raw);
    if (!parsed) return {};

    // Only keep entries that are string directives for known field names
    const validKeys = new Set(runtimeAiFields.map((f) => f.fieldName));
    const directives: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (validKeys.has(key) && typeof value === 'string' && value.trim().length > 0) {
        directives[key] = value.trim();
      }
    }

    if (Object.keys(directives).length > 0) {
      logger.info({
        event: 'field_directives_generated',
        stage: 'property_population',
        correlationId,
        nodeId,
        nodeType,
        fieldCount: Object.keys(directives).length,
        fields: Object.keys(directives),
      });
    }

    return directives;
  } catch (err) {
    logger.warn({
      event: 'field_directives_skipped',
      stage: 'property_population',
      correlationId,
      nodeId,
      nodeType,
      reason: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

// ─── Stage ───────────────────────────────────────────────────────────────────

/**
 * Run the Property Population Stage.
 *
 * For each node in the workflow:
 * 1. Look up its inputSchema in the registry.
 * 2. Filter to fields with fillMode.default === 'buildtime_ai_once' AND ownership !== 'credential'.
 * 3. Build an LLM prompt with userIntent, structuralPrompt, and field metadata.
 * 4. Call the LLM, parse the JSON response, apply the fillMode gate.
 * 5. Merge LLM values over defaultConfig() and write to node.data.config.
 * 6. Record written field names in propertyPopulationSummary.
 *
 * All per-node errors are caught and logged; the stage always returns ok: true.
 */
export async function runPropertyPopulationStage(
  input: PropertyPopulationStageInput,
): Promise<PropertyPopulationStageResult> {
  const { workflow, userIntent, structuralPrompt, correlationId } = input;
  const startedAt = Date.now();
  const graphDigest = buildCompactGraphDigest(workflow);

  logger.info({
    event: 'ai_pipeline_stage_start',
    stage: 'property_population',
    correlationId,
    inputSummary: `nodes=${workflow.nodes.length}`,
  });

  const summary: Record<string, string[]> = {};

  // Work on a shallow copy of nodes so we don't mutate the original array reference,
  // but we DO mutate node.data.config in place (nodes are objects).
  const nodes = workflow.nodes;

  for (const node of nodes) {
    const nodeId = node.id;
    const nodeType = node.type ?? node.data?.type;

    if (!nodeType) {
      logger.warn({
        event: 'ai_pipeline_stage_warn',
        stage: 'property_population',
        correlationId,
        nodeId,
        reason: 'node has no type — skipping',
      });
      continue;
    }

    try {
      // ── 2.2 Field selection ──────────────────────────────────────────────
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      if (!nodeDef) {
        logger.warn({
          event: 'ai_pipeline_stage_warn',
          stage: 'property_population',
          correlationId,
          nodeId,
          nodeType,
          reason: 'node type not found in registry — skipping',
        });
        continue;
      }

      const inputSchema = nodeDef.inputSchema;
      const existingConfig = (node.data?.config || {}) as Record<string, any>;

      const eligibleFields = Object.entries(inputSchema).filter(
        ([fieldName, field]) => {
          if (field.ownership === 'credential') return false;
          // Primary: buildtime_ai_once fields are always eligible
          if (field.fillMode?.default === 'buildtime_ai_once') return true;
          // Secondary: manual_static fields where the registry signals AI can suggest
          // a value (supportsBuildtimeAI: true) AND the field is still at its
          // registry default — meaning no explicit user or prior AI choice was made.
          // This lets the LLM infer operation/method/action from intent without
          // adding per-node special cases anywhere in the pipeline.
          if (
            field.fillMode?.default === 'manual_static' &&
            field.fillMode?.supportsBuildtimeAI === true &&
            isAtRegistryDefault(existingConfig[fieldName], (field as any).default)
          ) return true;
          return false;
        },
      );

      if (eligibleFields.length === 0) {
        // No eligible fields — leave config unchanged
        continue;
      }

      // ── Find upstream node type for build value context ──────────────────
      let upstreamNodeType: string | undefined;
      try {
        const incomingEdge = workflow.edges.find((e) => e.target === nodeId);
        if (incomingEdge) {
          const upstreamNode = workflow.nodes.find((n) => n.id === incomingEdge.source);
          if (upstreamNode) {
            upstreamNodeType = upstreamNode.type ?? upstreamNode.data?.type;
          }
        }
      } catch {
        // non-blocking
      }

      // ── Get build value context from registry ────────────────────────────
      const buildCtx = unifiedNodeRegistry.getBuildValueContext(nodeType, upstreamNodeType);

      if (!node.data) {
        (node as { data: Record<string, unknown> }).data = { config: {} };
      }

      // ── 2.3 LLM prompt construction ─────────────────────────────────────
      const systemPrompt =
        'You are a workflow configuration assistant specializing in automation workflows. ' +
        'Given a user\'s intent, a workflow blueprint, and a node\'s input schema, return a JSON object with values for the specified fields.\n' +
        'CRITICAL RULES FOR CONTROL FLOW NODES:\n' +
        '- if_else nodes: "conditions" MUST be a non-empty array of objects: [{ "field": "$json.<key>", "operator": "<op>", "value": "<val>" }]\n' +
        '  Valid operators: equals, not_equals, greater_than, less_than, greater_than_or_equal, less_than_or_equal, contains, not_contains, starts_with, ends_with\n' +
        '  NEVER return conditions: [] — an empty array will break the workflow branch.\n' +
        '- switch nodes: "expression" MUST be {{$json.<routingField>}} referencing the upstream field that drives branching.\n' +
        '  "cases" MUST be a non-empty array of objects: [{ "value": "<case_value>", "label": "<Human Label>" }]\n' +
        '  Include ALL distinct case values implied by the workflow. NEVER return cases: [].\n' +
        '- loop nodes: "items" MUST be {{$json.<arrayField>}} referencing an upstream array.\n' +
        '- Use {{$json.<fieldName>}} syntax for template references to upstream node output fields.\n' +
        'Return ONLY valid JSON. No markdown, no explanation, no extra text.';

      const fieldsText = eligibleFields
        .map(([fieldName, field]) => {
          let line = `  - ${fieldName} (type: ${field.type}): ${field.description}`;
          if (Array.isArray(field.examples) && field.examples.length > 0) {
            line += `\n    examples: ${JSON.stringify(field.examples)}`;
          }
          return line;
        })
        .join('\n');

      // ── Collect upstream form field keys (shared by if_else and switch) ────
      const upstreamFormKeys: string[] = [];
      for (const n of workflow.nodes) {
        const nt = n.type ?? n.data?.type ?? '';
        if (nt === 'form' || nt === 'form_trigger') {
          const formFields = (n.data?.config as any)?.fields;
          if (Array.isArray(formFields)) {
            for (const f of formFields) {
              const key = f.name ?? f.key ?? f.id;
              if (key && typeof key === 'string') upstreamFormKeys.push(key);
            }
          }
        }
      }

      // ── For if_else nodes: inject upstream form field keys and conditions format ─
      let upstreamFormFieldsHint = '';
      if (nodeType === 'if_else') {
        if (upstreamFormKeys.length > 0) {
          upstreamFormFieldsHint =
            `\nUPSTREAM_FORM_FIELD_KEYS (MUST use these exact keys in $json.* condition fields):\n` +
            upstreamFormKeys.map((k) => `  - ${k} → use "$json.${k}" in condition "field" property`).join('\n') +
            `\nCRITICAL: condition "field" values MUST be "$json.<key>" using ONLY the keys listed above. ` +
            `Do NOT invent field names. If the user says "years of experience" and the form field is "experience", use "$json.experience".\n`;
        }
        upstreamFormFieldsHint +=
          `\nREQUIRED FORMAT for "conditions" field (return this exact structure):\n` +
          `  [{ "field": "$json.<fieldKey>", "operator": "<operator>", "value": "<compareValue>" }]\n` +
          `  Valid operators: equals, not_equals, greater_than, less_than, greater_than_or_equal, less_than_or_equal, contains, not_contains, starts_with, ends_with\n` +
          `  Example: [{ "field": "$json.status", "operator": "equals", "value": "approved" }]\n` +
          `  CRITICAL: DO NOT return an empty array []. You MUST produce at least one condition derived from the user's intent.\n`;
      }

      // ── For switch nodes: inject routing field context and cases format ────
      let switchHint = '';
      if (nodeType === 'switch') {
        const primaryKey = upstreamFormKeys.length > 0 ? upstreamFormKeys[0] : '';
        const exampleExpr = primaryKey ? `{{$json.${primaryKey}}}` : '{{$json.status}}';
        if (upstreamFormKeys.length > 0) {
          switchHint =
            `\nUPSTREAM_FORM_FIELD_KEYS (pick the routing field for the switch expression):\n` +
            upstreamFormKeys.map((k) => `  - ${k} → expression: "{{$json.${k}}}"`).join('\n') +
            `\n`;
        }
        switchHint +=
          `\nREQUIRED FORMAT for "expression" field:\n` +
          `  A template expression referencing the field that drives routing.\n` +
          `  Example: "${exampleExpr}"\n` +
          `  MUST use {{$json.<fieldKey>}} syntax. Select the upstream field whose value determines which branch executes.\n` +
          `\nREQUIRED FORMAT for "cases" field (return this exact structure):\n` +
          `  [{ "value": "<case_value>", "label": "<Human Readable Label>" }]\n` +
          `  Derive case values from the workflow context and user's intent (e.g., status values, category names).\n` +
          `  Example: [{ "value": "approved", "label": "Approved" }, { "value": "rejected", "label": "Rejected" }, { "value": "pending", "label": "Pending Review" }]\n` +
          `  CRITICAL: Include ALL distinct routing paths described or implied by the user. An empty cases array breaks all branching.\n`;
      }

      // Build upstream fields hint
      let upstreamFieldsHint = '';
      if (buildCtx.upstreamFields.length > 0) {
        upstreamFieldsHint =
          `\nUPSTREAM_OUTPUT_FIELDS (reference these in long_body fields using {{$json.<field>}} syntax):\n` +
          buildCtx.upstreamFields
            .map((f) => `  - ${f.name}: ${f.type}${f.description ? ` — ${f.description}` : ''}`)
            .join('\n') +
          `\nFor fields with role "long_body", you MUST include at least one {{$json.<field>}} reference ` +
          `where <field> is one of the upstream field names listed above.\n`;
      }

      // Build field roles hint
      let fieldRolesHint = '';
      if (buildCtx.targetFields.length > 0) {
        fieldRolesHint =
          `\nFIELD_ROLES (use these to guide value generation):\n` +
          buildCtx.targetFields
            .map((f) => `  - ${f.name}: role=${f.role}, essential=${f.essentialForExecution}`)
            .join('\n') +
          `\nFor "title_like" fields: generate a concise, human-readable summary derived from the user's intent. ` +
          `Do NOT use generic placeholders like "Generated Subject" or "Process the workflow".\n` +
          `For "long_body" fields: reference upstream data using {{$json.<field>}} template syntax.\n`;
      }

      // ── Upstream data flow context (full upstream chain) ────────────────
      // Walk ALL upstream nodes via edges so the LLM sees the complete data
      // shape arriving at this node — not just the immediate predecessor.
      let upstreamDataFlowHint = '';
      try {
        const upstreamChain: Array<{ nodeType: string; nodeLabel: string; outputFields: string[] }> = [];
        const visited = new Set<string>();
        const queue = [nodeId];
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          if (visited.has(currentId)) continue;
          visited.add(currentId);
          for (const edge of workflow.edges) {
            if (edge.target !== currentId || visited.has(edge.source)) continue;
            const upNode = workflow.nodes.find((n) => n.id === edge.source);
            if (!upNode) continue;
            const upType = String(upNode.type ?? upNode.data?.type ?? '');
            const upDef = unifiedNodeRegistry.get(upType);
            const upLabel = String(upNode.data?.label || upType);
            const outputFields: string[] = [];
            if (upDef?.outputSchema) {
              outputFields.push(...Object.keys(upDef.outputSchema));
            }
            // Form nodes surface their configured fields as output
            if (upType === 'form' || upType === 'form_trigger') {
              const formFields = (upNode.data?.config as any)?.fields;
              if (Array.isArray(formFields)) {
                for (const f of formFields) {
                  const key = f.name ?? f.key ?? f.label ?? f.id;
                  if (key && typeof key === 'string' && !outputFields.includes(key)) {
                    outputFields.push(key);
                  }
                }
              }
            }
            upstreamChain.push({ nodeType: upType, nodeLabel: upLabel, outputFields });
            queue.push(edge.source);
          }
        }
        if (upstreamChain.length > 0) {
          upstreamDataFlowHint =
            `\nUPSTREAM_DATA_FLOW (nodes feeding data into this node, use {{$json.<field>}} to reference):\n` +
            upstreamChain
              .map((n) =>
                `  - ${n.nodeLabel} (${n.nodeType})` +
                (n.outputFields.length > 0 ? `: outputs [${n.outputFields.join(', ')}]` : ''),
              )
              .join('\n') + '\n';
        }
      } catch {
        // non-blocking
      }

      // ── Operation options hint for AI-suggestible manual_static fields ──
      // When the LLM must infer an operation from intent, give it the exact
      // valid values from the node's operation contracts rather than guessing.
      let operationOptionsHint = '';
      for (const [fieldName, field] of eligibleFields) {
        if (
          field.fillMode?.default === 'manual_static' &&
          field.fillMode?.supportsBuildtimeAI === true
        ) {
          const contracts = (nodeDef as any).operationContracts;
          if (Array.isArray(contracts) && contracts.length > 0) {
            const validOps = contracts
              .map((c: any) => c.operation)
              .filter((op: any) => typeof op === 'string');
            if (validOps.length > 0) {
              operationOptionsHint +=
                `\nFOR FIELD "${fieldName}": choose the value that matches the user's intent.\n` +
                `  Valid values: [${validOps.join(', ')}]\n` +
                `  Hint — "append" = inserting new rows/records, "read" = fetching/retrieving data, ` +
                `"write" = overwriting, "update" = editing existing rows, ` +
                `"create" = creating new resources, "send" = sending messages.\n` +
                `  User intent says: "${userIntent.slice(0, 200)}"\n`;
            }
          }
        }
      }

      const userMessage =
        `USER_INTENT:\n${userIntent}\n\n` +
        `WORKFLOW_BLUEPRINT:\n${structuralPrompt}\n\n` +
        `WORKFLOW_NODE_ORDER:\n${graphDigest}\n\n` +
        `NODE_TYPE: ${nodeType}\n` +
        `NODE_ID: ${nodeId}\n` +
        upstreamDataFlowHint +
        upstreamFormFieldsHint +
        switchHint +
        upstreamFieldsHint +
        fieldRolesHint +
        operationOptionsHint +
        `\nFIELDS_TO_POPULATE:\n${fieldsText}\n\n` +
        `Return a JSON object with keys matching the field names above.\n` +
        `For array/object fields, return valid JSON values (not strings).\n` +
        `REMINDER: Never return empty arrays for conditions, cases, or items fields.`;

      // ── 2.4 LLM call, JSON parsing, fillMode gate ────────────────────────
      let rawResponse: string;
      try {
        const result = await geminiOrchestrator.processRequest(
          'property-population',
          { system: systemPrompt, message: userMessage },
          { model: 'gemini-3.5-flash', temperature: 0.1, cache: false },
        );
        rawResponse = typeof result === 'string' ? result : JSON.stringify(result);
      } catch (llmErr) {
        throw llmErr; // caught by outer per-node try/catch (2.5)
      }

      let parsed = tryParseJson(rawResponse);

      if (!parsed) {
        // One retry with explicit JSON reminder
        logger.warn({
          event: 'ai_pipeline_stage_warn',
          stage: 'property_population',
          correlationId,
          nodeId,
          nodeType,
          reason: 'LLM returned unparseable JSON — retrying',
        });

        try {
          const retryMessage =
            userMessage +
            '\n\nCRITICAL: Your previous response was not valid JSON. ' +
            'Return ONLY the JSON object, nothing else. No markdown fences.';
          const retryResult = await geminiOrchestrator.processRequest(
            'property-population',
            { system: systemPrompt, message: retryMessage },
            { model: 'gemini-3.5-flash', temperature: 0.1, cache: false },
          );
          const retryRaw = typeof retryResult === 'string' ? retryResult : JSON.stringify(retryResult);
          parsed = tryParseJson(retryRaw);
        } catch (retryErr) {
          throw retryErr; // caught by outer per-node try/catch (2.5)
        }

        if (!parsed) {
          // Second failure — fall back to defaultConfig for this node
          logger.warn({
            event: 'ai_pipeline_stage_warn',
            stage: 'property_population',
            correlationId,
            nodeId,
            nodeType,
            reason: 'LLM returned unparseable JSON on retry — using defaultConfig',
          });
          const prior = node.data?.config && typeof node.data.config === 'object' ? node.data.config : {};
          node.data.config = { ...nodeDef.defaultConfig(), ...prior };
          continue;
        }
      }

      // Apply fillMode gate: only keep keys that are buildtime_ai_once and non-credential
      const filteredLlmValues: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const fieldDef = inputSchema[key];
        if (!fieldDef) continue;
        // Gate 1: Skip fields where supportsBuildtimeAI is explicitly false
        if (fieldDef.fillMode?.supportsBuildtimeAI === false) continue;
        // Gate 2: Skip fields where fillMode.default is runtime_ai (defer to runtime)
        if (fieldDef.fillMode?.default === 'runtime_ai') continue;
        // Gate 3: Allow buildtime_ai_once AND manual_static+supportsBuildtimeAI fields
        const isBuildtimeAi = fieldDef.fillMode?.default === 'buildtime_ai_once';
        const isAiSuggestableManual =
          fieldDef.fillMode?.default === 'manual_static' &&
          fieldDef.fillMode?.supportsBuildtimeAI === true;
        if (!isBuildtimeAi && !isAiSuggestableManual) continue;
        if (fieldDef.ownership === 'credential') continue;

        // For array/object fields: if LLM returned a string, try JSON.parse
        if ((fieldDef.type === 'array' || fieldDef.type === 'object') && typeof value === 'string') {
          try {
            filteredLlmValues[key] = JSON.parse(value);
          } catch {
            logger.warn({
              event: 'ai_pipeline_stage_warn',
              stage: 'property_population',
              correlationId,
              nodeId,
              nodeType,
              field: key,
              reason: 'Failed to JSON.parse string value for array/object field — using defaultConfig value',
            });
            // Use defaultConfig value for this field only
            const defaults = nodeDef.defaultConfig();
            if (defaults[key] !== undefined) {
              filteredLlmValues[key] = defaults[key];
            }
            // If no default, skip this field
          }
        } else {
          filteredLlmValues[key] = value;
        }
      }

      // ── Enforce {{$json.*}} references for long_body fields ──────────────
      if (buildCtx.upstreamFields.length > 0) {
        const firstUpstreamField = buildCtx.upstreamFields[0].name;
        for (const [key, value] of Object.entries(filteredLlmValues)) {
          const fieldDef = inputSchema[key];
          if (fieldDef?.role === 'long_body' && typeof value === 'string') {
            if (!value.includes('{{$json.')) {
              filteredLlmValues[key] = `${value}\n\n{{$json.${firstUpstreamField}}}`;
            }
          }
        }
      }

      // ── 2.5 Merge over defaults + existing config (preserve _fillMode, structural snapshots, etc.)
      const prior = node.data?.config && typeof node.data.config === 'object' ? node.data.config : {};

      // ── 2.5a Stamp _fillMode for every AI-written non-empty field ────────
      // Preserve any existing _fillMode entries from prior (e.g. structural fields
      // already stamped by an earlier materializer pass).
      const priorFillMode =
        typeof (prior as any)._fillMode === 'object' && (prior as any)._fillMode !== null
          ? { ...(prior as any)._fillMode }
          : {};

      for (const key of Object.keys(filteredLlmValues)) {
        const v = filteredLlmValues[key];
        const isEmpty =
          v === undefined ||
          v === null ||
          v === '' ||
          (Array.isArray(v) && v.length === 0) ||
          (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
        if (!isEmpty) {
          priorFillMode[key] = 'buildtime_ai_once';
        }
      }

      node.data.config = {
        ...nodeDef.defaultConfig(),
        ...prior,
        ...filteredLlmValues,
        _fillMode: priorFillMode, // ← always write the stamped map
      };

      // ── Generate per-field directives for runtime_ai fields ──────────────
      // These are stored as _fieldDirectives in node config and used at
      // execution time to give the AI resolver precise per-field instructions.
      const runtimeAiFields = Object.entries(inputSchema)
        .filter(
          ([, field]) =>
            field.fillMode?.default === 'runtime_ai' &&
            field.ownership !== 'credential' &&
            field.fillMode?.supportsRuntimeAI !== false,
        )
        .map(([fieldName, field]) => ({ fieldName, field: field as NodeInputField }));

      if (runtimeAiFields.length > 0) {
        // Collect all upstream field names (form fields + registry output fields)
        // so the directive LLM can generate precise {{$json.<name>}} references.
        const allUpstreamFieldNames: string[] = [];
        try {
          const visitedForDirectives = new Set<string>();
          const q2 = [nodeId];
          while (q2.length > 0) {
            const cid = q2.shift()!;
            if (visitedForDirectives.has(cid)) continue;
            visitedForDirectives.add(cid);
            for (const edge of workflow.edges) {
              if (edge.target !== cid || visitedForDirectives.has(edge.source)) continue;
              const upN = workflow.nodes.find((n) => n.id === edge.source);
              if (!upN) continue;
              const upT = String(upN.type ?? upN.data?.type ?? '');
              const upD = unifiedNodeRegistry.get(upT);
              if (upD?.outputSchema) {
                allUpstreamFieldNames.push(...Object.keys(upD.outputSchema));
              }
              if (upT === 'form' || upT === 'form_trigger') {
                const ff = (upN.data?.config as any)?.fields;
                if (Array.isArray(ff)) {
                  for (const f of ff) {
                    const k = f.name ?? f.key ?? f.label ?? f.id;
                    if (k && typeof k === 'string' && !allUpstreamFieldNames.includes(k)) {
                      allUpstreamFieldNames.push(k);
                    }
                  }
                }
              }
              q2.push(edge.source);
            }
          }
        } catch {
          // non-blocking
        }

        const directives = await generateRuntimeFieldDirectives({
          nodeId,
          nodeType,
          runtimeAiFields,
          userIntent,
          graphDigest,
          upstreamFieldNames: allUpstreamFieldNames.length > 0 ? allUpstreamFieldNames : undefined,
          correlationId,
        });
        if (Object.keys(directives).length > 0) {
          node.data.config = { ...node.data.config, _fieldDirectives: directives };
        }
      }

      // ── 2.6 Summary tracking ─────────────────────────────────────────────
      const writtenFields = Object.keys(filteredLlmValues);
      if (writtenFields.length > 0) {
        summary[nodeId] = writtenFields;
      }
    } catch (err) {
      // Per-node soft failure (2.5): log warn, leave node at defaultConfig, continue
      const nodeDef = unifiedNodeRegistry.get(nodeType ?? '');
      logger.warn({
        event: 'ai_pipeline_stage_warn',
        stage: 'property_population',
        correlationId,
        nodeId,
        nodeType,
        reason: `LLM call failed — using defaultConfig: ${err instanceof Error ? err.message : String(err)}`,
      });
      if (nodeDef) {
        const prior = node.data?.config && typeof node.data.config === 'object' ? node.data.config : {};
        node.data.config = { ...nodeDef.defaultConfig(), ...prior };
      }
      // Continue to next node — stage never throws
    }
  }

  const durationMs = Date.now() - startedAt;

  logger.info({
    event: 'ai_pipeline_stage_end',
    stage: 'property_population',
    correlationId,
    outputSummary: `populated=${Object.keys(summary).length} nodes`,
    durationMs,
  });

  return {
    ok: true,
    workflow,
    propertyPopulationSummary: summary,
    durationMs,
  };
}
