/**
 * Node Description Builder
 *
 * Builds per-node description blocks for a workflow plan.
 * ALL behavior is driven by the unified node registry — zero hardcoded node type strings,
 * zero hardcoded operation lists, zero hardcoded tag names beyond what the registry defines.
 *
 * Works universally for every node in the registry: WhatsApp, Slack, Telegram, Discord,
 * Airtable, Gmail, Sheets, custom nodes — anything registered.
 */

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { stripPlanTokenToType, extractBranchTag } from './plan-chain-prune';
import type { StructuredIntent } from './intent-structurer';
import type { CaseNodeMapping } from './summarize-layer';

export interface NodeDescriptionBlock {
  nodeType: string;
  nodeIndex: number;
  prose: string;
  receivesFrom?: string;
  passesTo?: string;
  /** Fields AI will build (buildtime_ai_once) — shown in structural prompt */
  aiBuildFields?: Array<{ name: string; type: string; required: boolean }>;
  /** Fields user must fill (manual_static, non-credential) */
  userFields?: Array<{ name: string; type: string; required: boolean }>;
  conditionExpression?: string;
  conditionSourceField?: string;
  trueBranchTarget?: string;
  falseBranchTarget?: string;
  switchCases?: Array<{ value: string; target: string }>;
  switchDiscriminant?: string;
  integrationOperation?: string;
  integrationDataSources?: Record<string, string>;
  branchTag?: string;
}

// ─── Registry helpers — no hardcoding ────────────────────────────────────────

function nodeLabel(nodeType: string): string {
  const def = unifiedNodeRegistry.get(nodeType);
  return def?.label || nodeType;
}

/**
 * Detect node category from registry only.
 * Returns the registry category string or undefined.
 */
function getCategory(nodeType: string): string | undefined {
  return unifiedNodeRegistry.get(nodeType)?.category;
}

/**
 * Check if a node has a specific tag — registry-driven.
 */
function hasTag(nodeType: string, tag: string): boolean {
  return unifiedNodeRegistry.get(nodeType)?.tags?.includes(tag) ?? false;
}

/**
 * Detect trigger: registry category === 'trigger'.
 */
function isTriggerNode(nodeType: string): boolean {
  return getCategory(nodeType) === 'trigger';
}

/**
 * Detect form-like: inputSchema has a 'fields' array field OR has 'form' tag.
 * Registry-driven — works for any node that collects structured user input.
 */
function isFormLike(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return false;
  if (def.tags?.includes('form')) return true;
  return (def.inputSchema as any)?.fields !== undefined;
}

/**
 * Detect if_else: isBranching AND outgoingPorts contains 'true' and 'false'.
 * Registry-driven — no hardcoded type name.
 */
function isIfElseNode(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return false;
  return (
    def.isBranching === true &&
    Array.isArray(def.outgoingPorts) &&
    def.outgoingPorts.includes('true') &&
    def.outgoingPorts.includes('false')
  );
}

/**
 * Detect switch: isBranching AND first outgoing port starts with 'case_'.
 * Registry-driven — no hardcoded type name.
 */
function isSwitchNode(nodeType: string): boolean {
  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return false;
  return (
    def.isBranching === true &&
    Array.isArray(def.outgoingPorts) &&
    def.outgoingPorts.length > 0 &&
    def.outgoingPorts[0].startsWith('case_')
  );
}

/**
 * Detect terminal: workflowBehavior.alwaysTerminal === true.
 */
function isTerminalNode(nodeType: string): boolean {
  return unifiedNodeRegistry.get(nodeType)?.workflowBehavior?.alwaysTerminal === true;
}

/**
 * Extract fields from inputSchema split by fillMode.
 * - aiBuildFields: fillMode.default === 'buildtime_ai_once' (AI generates these)
 * - userFields: fillMode.default === 'manual_static' AND ownership !== 'credential'
 * Registry-driven — no hardcoded field names.
 */
function extractFieldsByFillMode(nodeType: string): {
  aiBuildFields: Array<{ name: string; type: string; required: boolean }>;
  userFields: Array<{ name: string; type: string; required: boolean }>;
} {
  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return { aiBuildFields: [], userFields: [] };
  const inputSchema = def.inputSchema || {};
  const aiBuildFields: Array<{ name: string; type: string; required: boolean }> = [];
  const userFields: Array<{ name: string; type: string; required: boolean }> = [];

  for (const [name, fieldDef] of Object.entries(inputSchema)) {
    const fd = fieldDef as any;
    const fillMode: string = fd?.fillMode?.default ?? 'manual_static';
    const ownership: string = fd?.ownership ?? '';
    if (ownership === 'credential') continue; // never show credential fields

    const entry = {
      name,
      type: fd?.type || 'string',
      required: !!fd?.required,
    };

    if (fillMode === 'buildtime_ai_once') {
      aiBuildFields.push(entry);
    } else if (fillMode === 'manual_static') {
      userFields.push(entry);
    }
    // runtime_ai fields are resolved at execution time — not shown in structural prompt
  }

  return { aiBuildFields, userFields };
}

/**
 * Get the discriminant field for a switch node from the upstream node's outputSchema.
 * Prefers fields named: response, classification, category, label, result, message, status, value.
 * Falls back to first key in outputSchema. Registry-driven.
 */
function getSwitchDiscriminant(upstreamNodeType: string | undefined): string {
  if (!upstreamNodeType) return 'value';
  const def = unifiedNodeRegistry.get(upstreamNodeType);
  if (!def) return 'value';

  const preferredKeys = ['response', 'classification', 'category', 'label', 'result', 'message', 'status', 'value'];

  // Try outputSchema.properties
  const props = (def.outputSchema as any)?.properties;
  if (props && typeof props === 'object') {
    for (const key of preferredKeys) {
      if (key in props) return key;
    }
    const keys = Object.keys(props);
    if (keys.length > 0) return keys[0];
  }

  // Try outputSchema.default.schema.properties
  const defaultPort = (def.outputSchema as any)?.default;
  if (defaultPort?.schema?.properties) {
    for (const key of preferredKeys) {
      if (key in defaultPort.schema.properties) return key;
    }
    const keys = Object.keys(defaultPort.schema.properties);
    if (keys.length > 0) return keys[0];
  }

  return 'value';
}

/**
 * Get upstream output keys for data source description.
 * Registry-driven — reads outputSchema of the upstream node.
 */
function getUpstreamOutputKeys(upstreamNodeType: string | undefined): string[] {
  if (!upstreamNodeType) return [];
  const def = unifiedNodeRegistry.get(upstreamNodeType);
  if (!def) return [];

  const keys: string[] = [];
  const props = (def.outputSchema as any)?.properties;
  if (props && typeof props === 'object') keys.push(...Object.keys(props));

  const defaultPort = (def.outputSchema as any)?.default;
  if (defaultPort?.schema?.properties) {
    for (const k of Object.keys(defaultPort.schema.properties)) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

/**
 * Derive the operation a node performs from its registry inputSchema.
 * Reads the 'operation' field's default value — no hardcoded operation strings.
 * Falls back to the node's description or category.
 */
function deriveNodeOperation(nodeType: string, intentOperation?: string): string {
  // If the intent explicitly provides an operation, use it
  if (intentOperation) return intentOperation;

  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return '';

  // Try defaultConfig().operation
  try {
    const defaultCfg = typeof def.defaultConfig === 'function' ? def.defaultConfig() : {};
    if (defaultCfg?.operation && typeof defaultCfg.operation === 'string') {
      return defaultCfg.operation;
    }
  } catch { /* ignore */ }

  // Try inputSchema.operation enum/oneOf first value
  const opField = (def.inputSchema as any)?.operation;
  if (opField) {
    if (Array.isArray(opField.enum) && opField.enum.length > 0) return opField.enum[0];
    if (Array.isArray(opField.oneOf) && opField.oneOf.length > 0) {
      return opField.oneOf[0]?.const || opField.oneOf[0]?.enum?.[0] || '';
    }
  }

  return '';
}

/**
 * Build a human-readable action sentence for any node using only registry metadata.
 * Reads the node's description, category, tags, and operation — no hardcoded strings.
 *
 * The sentence describes:
 * - What the node does (from registry description or category)
 * - What operation it performs (from registry defaultConfig or inputSchema)
 * - Where data comes from (upstream node label)
 * - Where data goes (downstream node label)
 * - What the user prompt says about this node's purpose
 */
function buildNodeActionSentence(
  nodeType: string,
  operation: string,
  upstreamLabel: string | undefined,
  downstreamLabel: string | undefined,
  userPrompt: string,
  branchTag: string | undefined
): string {
  const def = unifiedNodeRegistry.get(nodeType);
  if (!def) return `Executes ${nodeType}`;

  const label = def.label || nodeType;
  const category = def.category || '';
  const tags = def.tags || [];
  const description = def.description || '';

  // Derive what this node does from its registry description (first sentence)
  const descFirstSentence = description.split(/[.!?]/)[0]?.trim() || '';

  // Derive the action verb from the operation or category
  const op = operation.toLowerCase();

  // Use registry outputSchema to describe what data this node produces
  const outputKeys = getUpstreamOutputKeys(nodeType);
  const outputDesc = outputKeys.length > 0 ? outputKeys.slice(0, 2).join(', ') : '';

  // Build the sentence from registry data
  let sentence = '';

  if (op) {
    // Operation-driven sentence: "Sends message to Slack" / "Reads rows from Google Sheets"
    sentence = `${capitalize(op)}s ${outputDesc ? `(${outputDesc}) ` : ''}using ${label}`;
  } else if (descFirstSentence) {
    sentence = descFirstSentence;
  } else if (category) {
    sentence = `${capitalize(category)} action using ${label}`;
  } else {
    sentence = `Executes ${label}`;
  }

  // Add data flow context
  if (upstreamLabel && downstreamLabel) {
    sentence += ` — receives data from ${upstreamLabel}, passes to ${downstreamLabel}`;
  } else if (upstreamLabel) {
    sentence += ` — receives data from ${upstreamLabel}`;
  } else if (downstreamLabel) {
    sentence += ` — passes data to ${downstreamLabel}`;
  }

  // Add branch context when present
  if (branchTag) {
    sentence += ` (${branchTag} branch)`;
  }

  return sentence;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Extract condition expression from the user prompt.
 * Looks for: numeric comparisons, boolean checks, keyword-based conditions.
 * Registry-driven fallback uses upstream node label.
 * Works for any prompt — no hardcoded field names.
 */
function extractConditionFromPrompt(
  userPrompt: string,
  upstreamNodeType: string | undefined
): { expression: string; sourceField: string } {
  // Pattern 1: numeric comparison — "score >= 700", "age > 18", "amount <= 100"
  const numericMatch = userPrompt.match(
    /\b([a-zA-Z_][a-zA-Z0-9_\s]*?)\s*(>=|<=|>|<|!=|==|=)\s*([0-9]+(?:\.[0-9]+)?)\b/
  );
  if (numericMatch) {
    const field = numericMatch[1].trim().replace(/\s+/g, '_');
    return {
      expression: `${field} ${numericMatch[2]} ${numericMatch[3]}`,
      sourceField: field,
    };
  }

  // Pattern 2: "if X is Y" / "when X equals Y"
  const equalityMatch = userPrompt.match(
    /\b(?:if|when|check(?:s)?|verify|validate)\s+([a-zA-Z_][a-zA-Z0-9_\s]*?)\s+(?:is|equals?|==)\s+([a-zA-Z0-9_"']+)/i
  );
  if (equalityMatch) {
    const field = equalityMatch[1].trim().replace(/\s+/g, '_');
    return {
      expression: `${field} equals ${equalityMatch[2].replace(/['"]/g, '')}`,
      sourceField: field,
    };
  }

  // Pattern 3: "if eligible", "if approved", "if valid" — boolean intent
  const booleanMatch = userPrompt.match(
    /\b(?:if|when)\s+(eligible|approved|valid|verified|active|enabled|true|false)\b/i
  );
  if (booleanMatch) {
    return {
      expression: `is ${booleanMatch[1].toLowerCase()}`,
      sourceField: booleanMatch[1].toLowerCase(),
    };
  }

  // Fallback: describe condition from upstream node
  if (upstreamNodeType) {
    const upstreamLabel = nodeLabel(upstreamNodeType);
    return {
      expression: `data from ${upstreamLabel} meets the condition`,
      sourceField: upstreamLabel,
    };
  }

  return { expression: 'condition is met', sourceField: 'input' };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build per-node description blocks for a workflow plan.
 *
 * Each block contains:
 * - prose: one human-readable sentence describing what this node does
 * - aiBuildFields: fields AI will generate at build time (buildtime_ai_once)
 * - userFields: fields the user must fill (manual_static, non-credential)
 * - conditionExpression / trueBranchTarget / falseBranchTarget: for if_else nodes
 * - switchCases / switchDiscriminant: for switch nodes
 * - integrationOperation / integrationDataSources: for integration nodes
 * - receivesFrom / passesTo: data flow context
 *
 * Zero hardcoded node type strings. Works for every node in the registry.
 */
export function buildNodeDescriptionBlocks(
  intent: StructuredIntent,
  chain: string[],
  caseNodeMapping?: CaseNodeMapping
): NodeDescriptionBlock[] {
  const blocks: NodeDescriptionBlock[] = [];
  // The user prompt is stored in intent.trigger when called from buildStructuredSummaryFromChain
  const userPrompt = intent.trigger || '';

  for (let i = 0; i < chain.length; i++) {
    const rawToken = chain[i];
    const nodeType = stripPlanTokenToType(rawToken);
    const branchTag = extractBranchTag(rawToken);
    const def = unifiedNodeRegistry.get(nodeType);

    const prevType = i > 0 ? stripPlanTokenToType(chain[i - 1]) : undefined;
    const nextType = i < chain.length - 1 ? stripPlanTokenToType(chain[i + 1]) : undefined;
    const receivesFrom = i === 0 ? 'user input' : nodeLabel(prevType!);
    const passesTo = nextType ? nodeLabel(nextType) : 'end of workflow';

    const block: NodeDescriptionBlock = {
      nodeType,
      nodeIndex: i,
      prose: '',
      receivesFrom,
      passesTo,
    };

    if (branchTag) block.branchTag = branchTag;

    // ── Terminal node ─────────────────────────────────────────────────────────
    if (isTerminalNode(nodeType)) {
      const { aiBuildFields, userFields } = extractFieldsByFillMode(nodeType);
      block.aiBuildFields = aiBuildFields;
      block.userFields = userFields;
      block.prose = `Records the final result${branchTag ? ` (${branchTag} branch)` : ''} — receives data from ${receivesFrom}`;
      blocks.push(block);
      continue;
    }

    // ── Trigger ───────────────────────────────────────────────────────────────
    if (isTriggerNode(nodeType)) {
      const { aiBuildFields, userFields } = extractFieldsByFillMode(nodeType);
      block.aiBuildFields = aiBuildFields;
      block.userFields = userFields;

      if (isFormLike(nodeType)) {
        // Form-trigger: show fields split by fillMode
        const allFields = [...aiBuildFields, ...userFields];
        const fieldDesc = allFields.length > 0
          ? allFields.map(f => `${f.name}: ${f.type}${f.required ? ', required' : ''}`).join('; ')
          : 'no fields configured';
        block.prose = `Starts the workflow when a form is submitted — collects ${fieldDesc}`;
      } else {
        // Non-form trigger: describe from registry description
        const desc = def?.description?.split(/[.!?]/)[0]?.trim() || `Starts the workflow`;
        block.prose = `${desc} — passes data to ${passesTo}`;
      }
      blocks.push(block);
      continue;
    }

    // ── Form (non-trigger) ────────────────────────────────────────────────────
    if (isFormLike(nodeType)) {
      const { aiBuildFields, userFields } = extractFieldsByFillMode(nodeType);
      block.aiBuildFields = aiBuildFields;
      block.userFields = userFields;

      const allFields = [...aiBuildFields, ...userFields];
      const fieldDesc = allFields.length > 0
        ? allFields.map(f => `${f.name}: ${f.type}${f.required ? ', required' : ''}`).join('; ')
        : 'no fields configured';
      block.prose = `Collects ${fieldDesc} from the user — passes data to ${passesTo}`;
      blocks.push(block);
      continue;
    }

    // ── If/Else branching ─────────────────────────────────────────────────────
    if (isIfElseNode(nodeType)) {
      const { expression, sourceField } = extractConditionFromPrompt(userPrompt, prevType);

      // True/false targets — look past annotated tokens
      const trueBranchTarget = nextType;
      // False branch: find the next node that is NOT the true branch target
      // In a branching chain: [..., if_else, nodeA[true], nodeB[false], ...]
      // or: [..., if_else, nodeA, nodeB, ...]
      let falseBranchTarget: string | undefined;
      for (let j = i + 2; j < chain.length; j++) {
        const t = stripPlanTokenToType(chain[j]);
        if (t !== trueBranchTarget && !isTerminalNode(t)) {
          falseBranchTarget = t;
          break;
        }
        // If it's the same type as true branch but different branchTag, it's the false branch
        const bt = extractBranchTag(chain[j]);
        if (t === trueBranchTarget && bt && bt !== (extractBranchTag(chain[i + 1]) || 'true')) {
          falseBranchTarget = t;
          break;
        }
      }

      block.conditionExpression = expression;
      block.conditionSourceField = sourceField;
      block.trueBranchTarget = trueBranchTarget;
      block.falseBranchTarget = falseBranchTarget;

      const trueLabel = trueBranchTarget ? nodeLabel(trueBranchTarget) : 'true branch';
      const falseLabel = falseBranchTarget ? nodeLabel(falseBranchTarget) : 'false branch';
      block.prose = `Checks if ${expression} — routes to ${trueLabel} when true, ${falseLabel} when false`;
      blocks.push(block);
      continue;
    }

    // ── Switch branching ──────────────────────────────────────────────────────
    if (isSwitchNode(nodeType)) {
      const discriminant = getSwitchDiscriminant(prevType);
      const switchCases: Array<{ value: string; target: string }> = [];

      if (caseNodeMapping && Object.keys(caseNodeMapping).length > 0) {
        for (const [caseValue, target] of Object.entries(caseNodeMapping)) {
          const targetType = typeof target === 'string'
            ? target
            : (target as any).targetNodeType || '';
          if (targetType) switchCases.push({ value: caseValue, target: targetType });
        }
      } else {
        // No caseNodeMapping — derive cases from downstream chain nodes
        for (let j = i + 1; j < chain.length; j++) {
          const t = stripPlanTokenToType(chain[j]);
          if (isTerminalNode(t)) continue;
          const bt = extractBranchTag(chain[j]);
          const caseValue = bt || `case_${j - i}`;
          switchCases.push({ value: caseValue, target: t });
        }
      }

      block.switchCases = switchCases;
      block.switchDiscriminant = discriminant;

      const caseLines = switchCases
        .map(c => `${c.value} → ${nodeLabel(c.target)}`)
        .join(', ');
      block.prose = switchCases.length > 0
        ? `Routes by ${discriminant} — ${caseLines}`
        : `Routes by ${discriminant} (cases derived at runtime)`;
      blocks.push(block);
      continue;
    }

    // ── Integration / action / output / utility nodes ─────────────────────────
    {
      // Find operation from intent
      const allActions = [
        ...(intent.actions || []),
        ...(intent.dataSources || []),
        ...(intent.transformations || []),
      ];
      const matchingAction = allActions.find(a => a.type === nodeType);
      const operation = deriveNodeOperation(nodeType, matchingAction?.operation);

      // Fields split by fillMode
      const { aiBuildFields, userFields } = extractFieldsByFillMode(nodeType);
      block.aiBuildFields = aiBuildFields;
      block.userFields = userFields;
      block.integrationOperation = operation || undefined;

      // Data sources from upstream
      const upstreamKeys = getUpstreamOutputKeys(prevType);
      if (upstreamKeys.length > 0 && prevType) {
        block.integrationDataSources = Object.fromEntries(
          upstreamKeys.map(k => [k, `from ${nodeLabel(prevType)}`])
        );
      }

      // Build the action sentence from registry metadata
      block.prose = buildNodeActionSentence(
        nodeType,
        operation,
        prevType ? nodeLabel(prevType) : undefined,
        nextType ? nodeLabel(nextType) : undefined,
        userPrompt,
        branchTag
      );

      // Append AI-build fields to the prose so the user sees what AI will configure
      if (aiBuildFields.length > 0) {
        const aiFieldDesc = aiBuildFields
          .map(f => `${f.name}: ${f.type}`)
          .join(', ');
        block.prose += ` [AI builds: ${aiFieldDesc}]`;
      }

      blocks.push(block);
    }
  }

  return blocks;
}
