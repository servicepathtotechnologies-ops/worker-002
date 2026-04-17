/**
 * Integration Tests — Full Pipeline Round-Trip (_fillMode persistence)
 *
 * Tests the complete pipeline:
 *   runPropertyPopulationStage → materializeStructuralFields → attachInputsHandler simulation
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4
 */

// ─── Mocks (hoisted before imports) ──────────────────────────────────────────

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../../core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: vi.fn(),
  },
}));

vi.mock('../../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: vi.fn(),
    getBuildValueContext: vi.fn(),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { runPropertyPopulationStage } from '../property-population-stage';
import { materializeStructuralFields } from '../../structure-materializer';
import { shouldPreserveExistingBuildtimeValue } from '../../../../core/utils/attach-inputs-merge-guard';
import type { Workflow } from '../../../../core/types/ai-types';
import type { NodeInputSchema } from '../../../../core/types/unified-node-contract';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockProcessRequest = geminiOrchestrator.processRequest as ReturnType<typeof vi.fn>;
const mockRegistryGet = unifiedNodeRegistry.get as ReturnType<typeof vi.fn>;
const mockGetBuildValueContext = (unifiedNodeRegistry as any).getBuildValueContext as ReturnType<typeof vi.fn>;

// ─── Shared schema fixtures ───────────────────────────────────────────────────

/** Slack-like schema: text + channel are buildtime_ai_once; webhookUrl is credential. */
const SLACK_INPUT_SCHEMA: NodeInputSchema = {
  text: {
    type: 'string',
    required: false,
    description: 'Message text',
    fillMode: { default: 'buildtime_ai_once' },
    ownership: 'value',
  },
  channel: {
    type: 'string',
    required: false,
    description: 'Slack channel',
    fillMode: { default: 'buildtime_ai_once' },
    ownership: 'value',
  },
  webhookUrl: {
    type: 'string',
    required: false,
    description: 'Webhook URL',
    fillMode: { default: 'manual_static' },
    ownership: 'credential',
  },
};

const SLACK_DEFAULT_CONFIG = () => ({ text: '', channel: '', webhookUrl: '' });

// ─── Workflow factory helpers ─────────────────────────────────────────────────

function makeSlackWorkflow(configOverride: Record<string, unknown> = {}): Workflow {
  return {
    nodes: [
      {
        id: 'slack_1',
        type: 'slack_message',
        data: {
          label: 'Slack',
          type: 'slack_message',
          category: 'communication',
          config: configOverride,
        },
      },
    ],
    edges: [],
  };
}

// ─── Inline simulation of attachInputsHandler field-application logic ─────────
//
// This mirrors the core per-node logic from attach-inputs.ts without requiring
// DB/Express. It processes mode_ keys first (sorted), then applies field values
// using shouldPreserveExistingBuildtimeValue as the guard.

interface AttachInputsSimResult {
  config: Record<string, any>;
  modeDiagnostics: {
    buildtimeMergePreserved: Array<{ nodeId: string; nodeType: string; fieldName: string; reason: string }>;
    runtimeOwnedFields: Array<{ nodeId: string; nodeType: string; fieldName: string }>;
    appliedModes: Array<{ nodeId: string; nodeType: string; fieldName: string; mode: string }>;
  };
}

function simulateAttachInputs(
  node: { id: string; type: string; data: { config: Record<string, any> } },
  inputSchema: NodeInputSchema,
  inputs: Record<string, unknown>,
): AttachInputsSimResult {
  const config: Record<string, any> = { ...node.data.config };
  if (config._fillMode && typeof config._fillMode === 'object') {
    config._fillMode = { ...(config._fillMode as object) };
  }

  const modeDiagnostics: AttachInputsSimResult['modeDiagnostics'] = {
    buildtimeMergePreserved: [],
    runtimeOwnedFields: [],
    appliedModes: [],
  };

  // Sort: mode_ keys first, then field keys (mirrors attach-inputs.ts sort)
  const sortedKeys = Object.keys(inputs).sort((a, b) => {
    const rank = (k: string) => (k.startsWith('mode_') ? 0 : 1);
    const d = rank(a) - rank(b);
    return d !== 0 ? d : a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const rawValue = inputs[key];

    // ── mode_ key processing ──────────────────────────────────────────────
    if (key.startsWith('mode_')) {
      const afterPrefix = key.substring('mode_'.length);
      const nodeIdPrefix = `${node.id}_`;
      if (!afterPrefix.startsWith(nodeIdPrefix)) continue;
      const modeFieldName = afterPrefix.substring(nodeIdPrefix.length);

      if (!config._fillMode || typeof config._fillMode !== 'object') {
        config._fillMode = {};
      }
      const modeValue = typeof rawValue === 'string' ? rawValue.trim() : '';
      if (modeValue === 'manual_static' || modeValue === 'runtime_ai' || modeValue === 'buildtime_ai_once') {
        (config._fillMode as Record<string, string>)[modeFieldName] = modeValue;
        modeDiagnostics.appliedModes.push({ nodeId: node.id, nodeType: node.type, fieldName: modeFieldName, mode: modeValue });

        if (modeValue === 'runtime_ai') {
          modeDiagnostics.runtimeOwnedFields.push({ nodeId: node.id, nodeType: node.type, fieldName: modeFieldName });
          // Clear stored static value so AI fills it at runtime (req 4.3, 4.4)
          if (config[modeFieldName] !== undefined) {
            delete config[modeFieldName];
          }
        }
      }
      continue;
    }

    // ── field value processing ────────────────────────────────────────────
    // Expect keys in format: <nodeId>_<fieldName>
    const nodeIdPrefix = `${node.id}_`;
    if (!key.startsWith(nodeIdPrefix)) continue;
    const fieldName = key.substring(nodeIdPrefix.length);

    const existingValue = config[fieldName];
    const preserve = shouldPreserveExistingBuildtimeValue(
      fieldName,
      inputSchema,
      config as Record<string, unknown>,
      existingValue,
      rawValue,
    );

    if (preserve.preserve) {
      modeDiagnostics.buildtimeMergePreserved.push({
        nodeId: node.id,
        nodeType: node.type,
        fieldName,
        reason: preserve.reason || 'buildtime_preserved',
      });
      continue;
    }

    config[fieldName] = rawValue;
  }

  return { config, modeDiagnostics };
}

// ─── Integration Tests ────────────────────────────────────────────────────────

describe('Full pipeline integration — _fillMode round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistryGet.mockReturnValue({
      inputSchema: SLACK_INPUT_SCHEMA,
      defaultConfig: SLACK_DEFAULT_CONFIG,
    });
    mockGetBuildValueContext.mockReturnValue({ upstreamFields: [], targetFields: [] });
  });

  // ── Test 1: Full pipeline (fix checking) ─────────────────────────────────

  /**
   * Validates: Requirements 2.1, 2.2, 2.5, 4.1, 4.2
   *
   * Full pipeline: runPropertyPopulationStage → materializeStructuralFields →
   * simulateAttachInputs with empty inputs → all AI-built values survive and
   * modeDiagnostics.buildtimeMergePreserved is non-empty.
   */
  it('AI-built values survive attach-inputs with empty inputs (full pipeline fix check)', async () => {
    // Stage 1: LLM writes non-empty values
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ text: 'Hello team', channel: '#general' }),
    );

    const stageResult = await runPropertyPopulationStage({
      workflow: makeSlackWorkflow(),
      userIntent: 'send slack message',
      structuralPrompt: 'trigger → slack',
    });

    expect(stageResult.ok).toBe(true);
    const nodeAfterStage = stageResult.workflow.nodes[0];
    const configAfterStage = nodeAfterStage.data.config as Record<string, any>;

    // Verify stage stamped _fillMode
    expect(configAfterStage._fillMode?.text).toBe('buildtime_ai_once');
    expect(configAfterStage._fillMode?.channel).toBe('buildtime_ai_once');

    // Stage 2: materializeStructuralFields (ensures stamps survive materializer)
    const workflowAfterMaterializer = materializeStructuralFields(stageResult.workflow);
    const nodeAfterMaterializer = workflowAfterMaterializer.nodes[0] as any;
    const configAfterMaterializer = nodeAfterMaterializer.data.config as Record<string, any>;

    // Stamps must survive materializer
    expect(configAfterMaterializer._fillMode?.text).toBe('buildtime_ai_once');
    expect(configAfterMaterializer._fillMode?.channel).toBe('buildtime_ai_once');
    expect(configAfterMaterializer.text).toBe('Hello team');
    expect(configAfterMaterializer.channel).toBe('#general');

    // Stage 3: simulate attach-inputs with empty incoming values
    const { config: finalConfig, modeDiagnostics } = simulateAttachInputs(
      { id: nodeAfterMaterializer.id, type: nodeAfterMaterializer.type, data: { config: configAfterMaterializer } },
      SLACK_INPUT_SCHEMA,
      {
        [`${nodeAfterMaterializer.id}_text`]: '',
        [`${nodeAfterMaterializer.id}_channel`]: '',
      },
    );

    // AI-built values must survive
    expect(finalConfig.text).toBe('Hello team');
    expect(finalConfig.channel).toBe('#general');

    // modeDiagnostics.buildtimeMergePreserved must be non-empty
    expect(modeDiagnostics.buildtimeMergePreserved.length).toBeGreaterThan(0);
    const preservedFields = modeDiagnostics.buildtimeMergePreserved.map(e => e.fieldName);
    expect(preservedFields).toContain('text');
    expect(preservedFields).toContain('channel');
  });

  // ── Test 2: User override flow ────────────────────────────────────────────

  /**
   * Validates: Requirements 4.1, 4.2
   *
   * Same pipeline → simulate attach-inputs with mode_<nodeId>_text = 'manual_static'
   * + text: 'override' → assert override persists and _fillMode.text = 'manual_static'.
   */
  it('user override (manual_static) persists and overrides AI-built value', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ text: 'AI-generated message', channel: '#general' }),
    );

    const stageResult = await runPropertyPopulationStage({
      workflow: makeSlackWorkflow(),
      userIntent: 'send slack message',
      structuralPrompt: 'trigger → slack',
    });

    const workflowAfterMaterializer = materializeStructuralFields(stageResult.workflow);
    const node = workflowAfterMaterializer.nodes[0] as any;
    const configAfterMaterializer = node.data.config as Record<string, any>;

    // Verify AI values are present before override
    expect(configAfterMaterializer.text).toBe('AI-generated message');
    expect(configAfterMaterializer._fillMode?.text).toBe('buildtime_ai_once');

    // Simulate attach-inputs: user sends manual_static mode + override value
    const { config: finalConfig, modeDiagnostics } = simulateAttachInputs(
      { id: node.id, type: node.type, data: { config: configAfterMaterializer } },
      SLACK_INPUT_SCHEMA,
      {
        [`mode_${node.id}_text`]: 'manual_static',
        [`${node.id}_text`]: 'override',
      },
    );

    // Override must persist
    expect(finalConfig.text).toBe('override');
    // _fillMode.text must be manual_static
    expect((finalConfig._fillMode as Record<string, string>).text).toBe('manual_static');
    // channel was not overridden — still AI-built
    expect(finalConfig.channel).toBe('#general');
    expect((finalConfig._fillMode as Record<string, string>).channel).toBe('buildtime_ai_once');

    // The override field must NOT appear in buildtimeMergePreserved
    const preservedFields = modeDiagnostics.buildtimeMergePreserved.map(e => e.fieldName);
    expect(preservedFields).not.toContain('text');
  });

  // ── Test 3: Runtime AI flow ───────────────────────────────────────────────

  /**
   * Validates: Requirements 4.3, 4.4
   *
   * Same pipeline → simulate attach-inputs with mode_<nodeId>_text = 'runtime_ai'
   * → assert config.text is cleared and _fillMode.text = 'runtime_ai'.
   */
  it('runtime_ai mode clears stored value and sets _fillMode.text = runtime_ai', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ text: 'AI-generated message', channel: '#general' }),
    );

    const stageResult = await runPropertyPopulationStage({
      workflow: makeSlackWorkflow(),
      userIntent: 'send slack message',
      structuralPrompt: 'trigger → slack',
    });

    const workflowAfterMaterializer = materializeStructuralFields(stageResult.workflow);
    const node = workflowAfterMaterializer.nodes[0] as any;
    const configAfterMaterializer = node.data.config as Record<string, any>;

    // Verify AI value is present before runtime_ai switch
    expect(configAfterMaterializer.text).toBe('AI-generated message');

    // Simulate attach-inputs: user switches text to runtime_ai
    const { config: finalConfig, modeDiagnostics } = simulateAttachInputs(
      { id: node.id, type: node.type, data: { config: configAfterMaterializer } },
      SLACK_INPUT_SCHEMA,
      {
        [`mode_${node.id}_text`]: 'runtime_ai',
      },
    );

    // config.text must be cleared (deleted)
    expect(finalConfig.text).toBeUndefined();
    expect('text' in finalConfig).toBe(false);

    // _fillMode.text must be runtime_ai
    expect((finalConfig._fillMode as Record<string, string>).text).toBe('runtime_ai');

    // channel is untouched
    expect(finalConfig.channel).toBe('#general');
    expect((finalConfig._fillMode as Record<string, string>).channel).toBe('buildtime_ai_once');

    // runtimeOwnedFields must record the field
    expect(modeDiagnostics.runtimeOwnedFields.length).toBeGreaterThan(0);
    expect(modeDiagnostics.runtimeOwnedFields[0].fieldName).toBe('text');
  });

  // ── Test 4: Multi-call idempotency ────────────────────────────────────────

  /**
   * Validates: Requirement 2.4
   *
   * Call simulateAttachInputs twice with empty inputs → AI-built values survive
   * both calls (idempotency).
   */
  it('AI-built values survive two consecutive attach-inputs calls with empty inputs (idempotency)', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ text: 'Idempotent AI message', channel: '#idempotent' }),
    );

    const stageResult = await runPropertyPopulationStage({
      workflow: makeSlackWorkflow(),
      userIntent: 'send slack message',
      structuralPrompt: 'trigger → slack',
    });

    const workflowAfterMaterializer = materializeStructuralFields(stageResult.workflow);
    const node = workflowAfterMaterializer.nodes[0] as any;
    const configAfterMaterializer = node.data.config as Record<string, any>;

    const emptyInputs = {
      [`${node.id}_text`]: '',
      [`${node.id}_channel`]: '',
    };

    // First call
    const { config: configAfterFirst, modeDiagnostics: diag1 } = simulateAttachInputs(
      { id: node.id, type: node.type, data: { config: configAfterMaterializer } },
      SLACK_INPUT_SCHEMA,
      emptyInputs,
    );

    expect(configAfterFirst.text).toBe('Idempotent AI message');
    expect(configAfterFirst.channel).toBe('#idempotent');
    expect(diag1.buildtimeMergePreserved.length).toBeGreaterThan(0);

    // Second call — using the output of the first call as input
    const { config: configAfterSecond, modeDiagnostics: diag2 } = simulateAttachInputs(
      { id: node.id, type: node.type, data: { config: configAfterFirst } },
      SLACK_INPUT_SCHEMA,
      emptyInputs,
    );

    // AI-built values must survive the second call too
    expect(configAfterSecond.text).toBe('Idempotent AI message');
    expect(configAfterSecond.channel).toBe('#idempotent');
    expect(diag2.buildtimeMergePreserved.length).toBeGreaterThan(0);

    // _fillMode stamps must be preserved across both calls
    expect((configAfterSecond._fillMode as Record<string, string>).text).toBe('buildtime_ai_once');
    expect((configAfterSecond._fillMode as Record<string, string>).channel).toBe('buildtime_ai_once');
  });
});
