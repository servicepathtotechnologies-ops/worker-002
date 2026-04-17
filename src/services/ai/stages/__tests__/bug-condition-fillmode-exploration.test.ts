/**
 * Bug Condition Exploration Test — AI Pre-Build Value Persistence Fix
 *
 * Task 1: Write bug condition exploration test
 *
 * CRITICAL: This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * DO NOT fix the code when it fails.
 *
 * Bug Condition (from design.md):
 *   FUNCTION isBugCondition(node, fieldName)
 *     RETURN node.data.config[fieldName] IS NOT EMPTY
 *            AND node.data.config._fillMode[fieldName] IS UNDEFINED
 *   END FUNCTION
 *
 * Root cause chain:
 *   1. property-population-stage writes AI values but does NOT stamp _fillMode[fieldName].
 *   2. collectEffectiveFillModesForWizard only serializes explicit _fillMode entries.
 *      Without the stamp, the wizard receives no mode_<nodeId>_<fieldName> keys.
 *   3. The wizard UI shows the field as "You" (manual) mode (no "AI build" pill).
 *   4. When the user submits, the wizard sends mode_<nodeId>_<fieldName> = 'manual_static'
 *      (because the UI shows "You" mode), which overrides _fillMode to 'manual_static'.
 *   5. shouldPreserveExistingBuildtimeValue now sees mode = 'manual_static' and returns
 *      { preserve: false }, so the AI-built value is overwritten.
 *
 * This test confirms:
 *   1. After runPropertyPopulationStage, config._fillMode[fieldName] is ABSENT (the bug).
 *   2. collectEffectiveFillModesForWizard returns empty (no mode_ keys for the wizard).
 *   3. When attach-inputs receives mode_<nodeId>_<fieldName> = 'manual_static' (from wizard
 *      showing "You" mode) + empty value, the AI-built value is overwritten.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

// ─── Mocks (must be declared before imports due to vi.mock hoisting) ─────────

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

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { runPropertyPopulationStage } from '../property-population-stage';
import type { Workflow } from '../../../../core/types/ai-types';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../../core/registry/unified-node-registry';
import { shouldPreserveExistingBuildtimeValue } from '../../../../core/utils/attach-inputs-merge-guard';
import { resolveEffectiveFieldFillMode } from '../../../../core/utils/fill-mode-resolver';

// ─── Inline collectEffectiveFillModesForWizard logic ─────────────────────────
// Inlined to avoid importing attach-inputs.ts (which triggers heavy module init).
// This mirrors the exact logic in worker/src/api/attach-inputs.ts.
function collectEffectiveFillModesForWizard(nodes: any[]): Record<string, string> {
  return (Array.isArray(nodes) ? nodes : []).reduce((acc: Record<string, string>, node: any) => {
    const perField = (node?.data?.config?._fillMode || {}) as Record<string, unknown>;
    for (const [fieldName, mode] of Object.entries(perField)) {
      if (
        mode === 'manual_static' ||
        mode === 'runtime_ai' ||
        mode === 'buildtime_ai_once'
      ) {
        acc[`mode_${node.id}_${fieldName}`] = mode as string;
      }
    }
    return acc;
  }, {});
}

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockProcessRequest = geminiOrchestrator.processRequest as ReturnType<typeof vi.fn>;
const mockRegistryGet = unifiedNodeRegistry.get as ReturnType<typeof vi.fn>;
const mockGetBuildValueContext = (unifiedNodeRegistry as any).getBuildValueContext as ReturnType<typeof vi.fn>;

// ─── Slack node mock definition ───────────────────────────────────────────────

/**
 * Mock Slack node inputSchema with text and channel fields that have
 * fillMode.default === 'buildtime_ai_once' (matching the real registry).
 */
const SLACK_INPUT_SCHEMA = {
  text: {
    type: 'string',
    description: 'The message text to send',
    fillMode: { default: 'buildtime_ai_once' },
    ownership: 'value',
  },
  channel: {
    type: 'string',
    description: 'The Slack channel to post to',
    fillMode: { default: 'buildtime_ai_once' },
    ownership: 'value',
  },
  webhookUrl: {
    type: 'string',
    description: 'Slack webhook URL',
    fillMode: { default: 'manual_static' },
    ownership: 'credential',
  },
};

const SLACK_DEFAULT_CONFIG = () => ({
  text: '',
  channel: '',
  webhookUrl: '',
});

function makeSlackWorkflow(): Workflow {
  return {
    nodes: [
      {
        id: 'slack_node_1',
        type: 'slack_message',
        data: {
          label: 'Send Slack Message',
          type: 'slack_message',
          category: 'communication',
          config: {},
        },
      },
    ],
    edges: [],
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Bug Condition Exploration — AI Pre-Build Value Persistence (Task 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock registry to return Slack node definition
    mockRegistryGet.mockReturnValue({
      inputSchema: SLACK_INPUT_SCHEMA,
      defaultConfig: SLACK_DEFAULT_CONFIG,
    });

    // Mock getBuildValueContext to return empty context (no upstream fields)
    mockGetBuildValueContext.mockReturnValue({
      upstreamFields: [],
      targetFields: [],
    });
  });

  // ── Bug Condition 1: _fillMode is absent after property-population-stage ────
  /**
   * Requirement 1.1: WHEN property-population-stage writes AI-generated values,
   * THEN the system does NOT write _fillMode[fieldName] = 'buildtime_ai_once'.
   *
   * This test WILL FAIL on unfixed code because config._fillMode is absent.
   * Expected counterexample: config._fillMode?.text === undefined
   *
   * **Validates: Requirements 1.1**
   */
  it('Bug 1.1 — after runPropertyPopulationStage writes non-empty text and channel, config._fillMode.text should be buildtime_ai_once (FAILS on unfixed code)', async () => {
    // LLM returns non-empty values for text and channel
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({
        text: 'Please review the attached report',
        channel: '#general',
      }),
    );

    const workflow = makeSlackWorkflow();
    const result = await runPropertyPopulationStage({
      workflow,
      userIntent: 'Send a Slack notification about the report',
      structuralPrompt: 'trigger → slack_message',
      correlationId: 'bug-exploration-1-1',
    });

    expect(result.ok).toBe(true);

    const node = result.workflow.nodes[0];
    const config = node.data.config as Record<string, any>;

    // Confirm the AI values were written (precondition)
    expect(config.text).toBe('Please review the attached report');
    expect(config.channel).toBe('#general');

    // BUG CONDITION: _fillMode should be stamped but is absent on unfixed code.
    // This assertion WILL FAIL on unfixed code (isBugCondition returns true).
    expect(config._fillMode?.text).toBe('buildtime_ai_once');
  });

  it('Bug 1.1b — after runPropertyPopulationStage writes non-empty channel, config._fillMode.channel should be buildtime_ai_once (FAILS on unfixed code)', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({
        text: 'Please review the attached report',
        channel: '#general',
      }),
    );

    const workflow = makeSlackWorkflow();
    const result = await runPropertyPopulationStage({
      workflow,
      userIntent: 'Send a Slack notification about the report',
      structuralPrompt: 'trigger → slack_message',
      correlationId: 'bug-exploration-1-1b',
    });

    expect(result.ok).toBe(true);

    const node = result.workflow.nodes[0];
    const config = node.data.config as Record<string, any>;

    // Confirm the AI values were written (precondition)
    expect(config.channel).toBe('#general');

    // BUG CONDITION: _fillMode.channel should be stamped but is absent on unfixed code.
    // This assertion WILL FAIL on unfixed code.
    expect(config._fillMode?.channel).toBe('buildtime_ai_once');
  });

  // ── Bug Condition 2: collectEffectiveFillModesForWizard returns empty ────────
  /**
   * Requirement 1.2: WHEN attach-inputs is called for a node whose AI-built fields have
   * no explicit _fillMode entry, THEN collectEffectiveFillModesForWizard returns no
   * mode_ keys for those fields, so the wizard cannot send them back.
   *
   * This test demonstrates the frontend round-trip gap: without _fillMode stamp,
   * the wizard never receives mode_<nodeId>_<fieldName> keys, so it shows the field
   * as "You" (manual) mode and sends mode_<nodeId>_<fieldName> = 'manual_static' on submit.
   *
   * **Validates: Requirements 1.2**
   */
  it('Bug 1.2 — without _fillMode stamp, collectEffectiveFillModesForWizard returns no mode_ keys for text/channel (FAILS on unfixed code)', async () => {
    // Step 1: Run property-population-stage — LLM writes non-empty values
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({
        text: 'Please review the attached report',
        channel: '#general',
      }),
    );

    const workflow = makeSlackWorkflow();
    const stageResult = await runPropertyPopulationStage({
      workflow,
      userIntent: 'Send a Slack notification about the report',
      structuralPrompt: 'trigger → slack_message',
      correlationId: 'bug-exploration-1-2',
    });

    expect(stageResult.ok).toBe(true);

    const nodeAfterStage = stageResult.workflow.nodes[0];
    const configAfterStage = nodeAfterStage.data.config as Record<string, any>;

    // Confirm AI values were written
    expect(configAfterStage.text).toBe('Please review the attached report');
    expect(configAfterStage.channel).toBe('#general');

    // Step 2: Simulate what collectEffectiveFillModesForWizard does with the node
    // after property-population-stage (no _fillMode stamp on unfixed code).
    const wizardModeKeys = collectEffectiveFillModesForWizard([nodeAfterStage]);

    // BUG: Without _fillMode stamp, the wizard gets no mode_ keys for text/channel.
    // The wizard then shows these fields as "You" (manual) mode.
    // This assertion WILL FAIL on unfixed code because the wizard gets no mode_ keys.
    // On fixed code: _fillMode.text = 'buildtime_ai_once' → wizard gets
    //   mode_slack_node_1_text = 'buildtime_ai_once'
    //   mode_slack_node_1_channel = 'buildtime_ai_once'
    expect(wizardModeKeys['mode_slack_node_1_text']).toBe('buildtime_ai_once');
    expect(wizardModeKeys['mode_slack_node_1_channel']).toBe('buildtime_ai_once');
  });

  // ── Bug Condition 3: Full pipeline — fixed path: wizard sends buildtime_ai_once → value preserved ──
  /**
   * Requirement 1.3: WHEN the stage correctly stamps _fillMode[fieldName] = 'buildtime_ai_once',
   * THEN collectEffectiveFillModesForWizard sends that mode to the wizard,
   * the wizard echoes it back, and shouldPreserveExistingBuildtimeValue returns { preserve: true },
   * so the AI-built value survives an empty incoming value.
   *
   * This test simulates the full fixed pipeline:
   *   1. Stage writes AI value AND stamps _fillMode.text = 'buildtime_ai_once' (the fix)
   *   2. collectEffectiveFillModesForWizard reads _fillMode → sends mode_<nodeId>_text = 'buildtime_ai_once'
   *   3. Wizard shows "AI build" pill and echoes mode_<nodeId>_text = 'buildtime_ai_once' on submit
   *   4. attach-inputs processes mode_ key → _fillMode.text = 'buildtime_ai_once'
   *   5. shouldPreserveExistingBuildtimeValue sees buildtime_ai_once + empty incoming → { preserve: true }
   *   6. AI-built value survives
   *
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  it('Bug 1.3 — full pipeline: wizard sends buildtime_ai_once mode → AI-written text is preserved', async () => {
    // Step 1: Run property-population-stage — LLM writes non-empty values
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({
        text: 'Please review the attached report',
        channel: '#general',
      }),
    );

    const workflow = makeSlackWorkflow();
    const stageResult = await runPropertyPopulationStage({
      workflow,
      userIntent: 'Send a Slack notification about the report',
      structuralPrompt: 'trigger → slack_message',
      correlationId: 'bug-exploration-1-3',
    });

    expect(stageResult.ok).toBe(true);

    const nodeAfterStage = stageResult.workflow.nodes[0];
    const configAfterStage = { ...(nodeAfterStage.data.config as Record<string, any>) };

    // Confirm AI values were written
    expect(configAfterStage.text).toBe('Please review the attached report');
    expect(configAfterStage.channel).toBe('#general');

    // Step 2: Read the actual _fillMode.text stamped by the stage (fixed code stamps 'buildtime_ai_once').
    // This is what the wizard receives via collectEffectiveFillModesForWizard.
    const actualFillMode = (configAfterStage._fillMode as Record<string, string> | undefined)?.['text'];

    // On fixed code, the stage stamps _fillMode.text = 'buildtime_ai_once'.
    expect(actualFillMode).toBe('buildtime_ai_once');

    // Step 3: Simulate the wizard echoing back the actual mode it received.
    // The wizard sends mode_slack_node_1_text = actualFillMode (not hardcoded 'manual_static').
    // attach-inputs processes the mode_ key → _fillMode.text = actualFillMode.
    if (!configAfterStage._fillMode || typeof configAfterStage._fillMode !== 'object') {
      configAfterStage._fillMode = {};
    }
    (configAfterStage._fillMode as Record<string, string>)['text'] = actualFillMode!;

    // Step 4: shouldPreserveExistingBuildtimeValue is called with the actual mode from the stage.
    const incomingEmptyText = '';
    const preserveResult = shouldPreserveExistingBuildtimeValue(
      'text',
      SLACK_INPUT_SCHEMA as any,
      configAfterStage,
      configAfterStage.text,  // existing AI value: 'Please review the attached report'
      incomingEmptyText,       // incoming empty value from wizard
    );

    // Step 5: With buildtime_ai_once mode + empty incoming value → { preserve: true }.
    expect(preserveResult.preserve).toBe(true);

    // Step 6: Simulate the attach-inputs field application — value survives.
    if (!preserveResult.preserve) {
      configAfterStage.text = incomingEmptyText;
    }

    // FIXED: _fillMode.text = 'buildtime_ai_once' was stamped by the stage,
    // the wizard echoed it back, the guard returns { preserve: true } → value survives.
    expect(configAfterStage.text).toBe('Please review the attached report');
  });

  // ── Counterexample documentation ─────────────────────────────────────────────
  /**
   * This test documents the exact counterexample that proves the bug exists.
   * It asserts the BUG behavior (what happens on unfixed code).
   * This test PASSES on unfixed code (confirming the bug) and should FAIL after the fix.
   *
   * **Validates: Requirements 1.1 (documents root cause)**
   */
  it('Counterexample — config._fillMode is absent after stage on unfixed code (documents the bug, passes on unfixed code)', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({
        text: 'Please review the attached report',
        channel: '#general',
      }),
    );

    const workflow = makeSlackWorkflow();
    const result = await runPropertyPopulationStage({
      workflow,
      userIntent: 'Send a Slack notification',
      structuralPrompt: 'trigger → slack_message',
      correlationId: 'counterexample-doc',
    });

    const config = result.workflow.nodes[0].data.config as Record<string, any>;

    // Document the counterexample: _fillMode is absent (the bug condition)
    // This assertion PASSES on unfixed code — confirming the bug exists.
    // After the fix, this assertion will FAIL (because _fillMode will be present).
    const fillModeTextIsUndefined = config._fillMode?.text === undefined;
    const fillModeChannelIsUndefined = config._fillMode?.channel === undefined;

    // Counterexample: isBugCondition(node, 'text') === true
    // config.text is non-empty AND config._fillMode.text is undefined
    console.log('[BugExploration] Counterexample found:', {
      'config.text': config.text,
      'config.channel': config.channel,
      'config._fillMode': config._fillMode,
      'isBugCondition(text)': config.text !== '' && config._fillMode?.text === undefined,
      'isBugCondition(channel)': config.channel !== '' && config._fillMode?.channel === undefined,
    });

    // On unfixed code: _fillMode is absent → these are true
    expect(fillModeTextIsUndefined).toBe(true);
    expect(fillModeChannelIsUndefined).toBe(true);
  });

  // ── Counterexample 2: wizard round-trip gap ───────────────────────────────────
  /**
   * Documents that collectEffectiveFillModesForWizard returns empty when _fillMode is absent.
   * This PASSES on unfixed code (confirming the round-trip gap).
   *
   * **Validates: Requirements 1.2 (documents round-trip gap)**
   */
  it('Counterexample — collectEffectiveFillModesForWizard returns empty when _fillMode is absent (passes on unfixed code)', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({
        text: 'Please review the attached report',
        channel: '#general',
      }),
    );

    const workflow = makeSlackWorkflow();
    const result = await runPropertyPopulationStage({
      workflow,
      userIntent: 'Send a Slack notification',
      structuralPrompt: 'trigger → slack_message',
      correlationId: 'counterexample-wizard',
    });

    const nodeAfterStage = result.workflow.nodes[0];
    const wizardModeKeys = collectEffectiveFillModesForWizard([nodeAfterStage]);

    console.log('[BugExploration] Wizard mode keys after stage (unfixed):', wizardModeKeys);

    // On unfixed code: no mode_ keys for text/channel → wizard shows "You" mode
    expect(Object.keys(wizardModeKeys)).not.toContain('mode_slack_node_1_text');
    expect(Object.keys(wizardModeKeys)).not.toContain('mode_slack_node_1_channel');
  });

  // ── Counterexample 3: manual_static override causes overwrite ────────────────
  /**
   * Documents that when the wizard sends manual_static (because it saw no "AI build" pill),
   * shouldPreserveExistingBuildtimeValue returns { preserve: false }.
   * This PASSES on unfixed code (confirming the overwrite path).
   *
   * **Validates: Requirements 1.3 (documents overwrite path)**
   */
  it('Counterexample — manual_static override causes shouldPreserveExistingBuildtimeValue to return { preserve: false } (passes on unfixed code)', () => {
    // Config after stage on unfixed code: AI value written, no _fillMode stamp
    const configAfterStage: Record<string, unknown> = {
      text: 'Please review the attached report',
      channel: '#general',
      webhookUrl: '',
      // _fillMode is absent — the bug condition
    };

    // Simulate wizard sending mode_<nodeId>_text = 'manual_static'
    // (because it saw no "AI build" pill for this field)
    (configAfterStage as any)._fillMode = { text: 'manual_static' };

    const result = shouldPreserveExistingBuildtimeValue(
      'text',
      SLACK_INPUT_SCHEMA as any,
      configAfterStage,
      configAfterStage.text,  // existing: 'Please review the attached report'
      '',                      // incoming: '' (empty from wizard)
    );

    console.log('[BugExploration] shouldPreserveExistingBuildtimeValue result with manual_static override:', result);

    // On unfixed code: _fillMode.text = 'manual_static' (set by wizard) → preserve: false
    // This confirms the overwrite path.
    expect(result.preserve).toBe(false);
  });
});
