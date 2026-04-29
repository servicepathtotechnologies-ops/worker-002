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
      const eligibleFields = Object.entries(inputSchema).filter(
        ([, field]) =>
          field.fillMode?.default === 'buildtime_ai_once' &&
          field.ownership !== 'credential',
      );

      if (eligibleFields.length === 0) {
        // No buildtime_ai_once fields — leave config unchanged
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

      const userMessage =
        `USER_INTENT:\n${userIntent}\n\n` +
        `WORKFLOW_BLUEPRINT:\n${structuralPrompt}\n\n` +
        `WORKFLOW_NODE_ORDER:\n${graphDigest}\n\n` +
        `NODE_TYPE: ${nodeType}\n` +
        `NODE_ID: ${nodeId}\n` +
        upstreamFormFieldsHint +
        switchHint +
        upstreamFieldsHint +
        fieldRolesHint +
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
          { model: 'gemini-2.5-flash', temperature: 0.1, cache: false },
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
            { model: 'gemini-2.5-flash', temperature: 0.1, cache: false },
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
        if (fieldDef.fillMode?.default !== 'buildtime_ai_once') continue;
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
