import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { runCapabilitySelectionStage } from '../stages/capability-selection-stage';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { geminiOrchestrator } from '../gemini-orchestrator';

jest.mock('../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

const mockedProcessRequest = geminiOrchestrator.processRequest as jest.MockedFunction<
  typeof geminiOrchestrator.processRequest
>;

const triggerStep = {
  stepId: 'trigger',
  stepText: 'Trigger via manual trigger',
  intentClass: 'trigger',
  candidateNodeTypes: ['manual_trigger'],
  defaultSuggestedNodeType: 'manual_trigger',
  confidence: 0.95,
  ambiguous: false,
  selectionPolicy: { multiSelectAllowed: false, required: true },
};

function mockSteps(steps: any[]) {
  mockedProcessRequest.mockResolvedValue({ steps });
}

describe('CapabilitySelectionStage', () => {
  const firstActionStep = (steps: any[]) =>
    steps.find((s) => s.stepId !== 'trigger' && String(s.stepId || '').startsWith('action_'));

  beforeEach(() => {
    mockedProcessRequest.mockReset();
  });

  it('returns AI-provided trigger plus action capability steps', async () => {
    mockSteps([
      triggerStep,
      {
        stepId: 'action_read_sheet',
        stepText: 'get data from sheets',
        intentClass: 'data_source',
        candidateNodeTypes: ['google_sheets'],
        defaultSuggestedNodeType: 'google_sheets',
        confidence: 0.93,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
      {
        stepId: 'action_send_email',
        stepText: 'send email summary',
        intentClass: 'communication',
        candidateNodeTypes: ['google_gmail'],
        defaultSuggestedNodeType: 'google_gmail',
        confidence: 0.92,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'Get data from sheets and send email summary',
      triggerType: 'manual_trigger',
      actions: ['get data from sheets', 'send email summary'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.length).toBe(3);
    expect(result.steps[0].stepId).toBe('trigger');
    expect(mockedProcessRequest).toHaveBeenCalledWith(
      'node-suggestion',
      expect.objectContaining({
        system: expect.stringContaining('NODE CATALOG'),
        message: expect.stringContaining('STRUCTURED_INTENT'),
      }),
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        cache: false,
      }),
    );
  });

  it('returns registry-only node types for all AI candidates', async () => {
    mockSteps([
      triggerStep,
      {
        stepId: 'action_send_notification',
        stepText: 'send notification',
        intentClass: 'communication',
        candidateNodeTypes: ['google_gmail', 'not_a_real_node'],
        defaultSuggestedNodeType: 'google_gmail',
        confidence: 0.8,
        ambiguous: true,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'Send notification',
      triggerType: 'manual_trigger',
      actions: ['send notification'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const step of result.steps) {
      for (const nodeType of step.candidateNodeTypes) {
        expect(unifiedNodeRegistry.get(nodeType)).toBeDefined();
      }
    }
    expect(firstActionStep(result.steps)?.candidateNodeTypes).not.toContain('not_a_real_node');
  });

  it('auto-resolves generic Google source prompts to one registry-backed default', async () => {
    mockSteps([
      triggerStep,
      {
        stepId: 'action_get_data_from_google',
        stepText: 'get data from Google',
        intentClass: 'data_source',
        candidateNodeTypes: ['google_sheets', 'google_drive', 'google_bigquery'],
        defaultSuggestedNodeType: null,
        confidence: 0.45,
        ambiguous: true,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
      {
        stepId: 'action_send_to_gmail',
        stepText: 'send it to Gmail',
        intentClass: 'communication',
        candidateNodeTypes: ['google_gmail'],
        defaultSuggestedNodeType: 'google_gmail',
        confidence: 0.94,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'get data from Google and send it to Gmail',
      triggerType: 'manual_trigger',
      actions: ['get data from Google', 'send it to Gmail'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sourceStep = result.steps.find((s) => s.stepId === 'action_get_data_from_google');
    const gmailStep = result.steps.find((s) => s.stepId === 'action_send_to_gmail');
    expect(sourceStep?.ambiguous).toBe(false);
    expect(sourceStep?.defaultSuggestedNodeType).toBe('google_sheets');
    expect(sourceStep?.candidateNodeTypes).toEqual(['google_sheets']);
    expect(sourceStep?.candidateNodeTypes).not.toContain('calendly');
    expect(gmailStep?.candidateNodeTypes).toEqual(['google_gmail']);
  });

  it('selects explicit Google Sheets and Gmail from AI registry choices', async () => {
    mockSteps([
      triggerStep,
      {
        stepId: 'action_get_data_from_google_sheets',
        stepText: 'get data from Google Sheets',
        intentClass: 'data_source',
        candidateNodeTypes: ['google_sheets'],
        defaultSuggestedNodeType: 'google_sheets',
        confidence: 0.96,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
      {
        stepId: 'action_send_to_gmail',
        stepText: 'send it to Gmail',
        intentClass: 'communication',
        candidateNodeTypes: ['google_gmail'],
        defaultSuggestedNodeType: 'google_gmail',
        confidence: 0.97,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'get data from Google Sheets and send it to Gmail',
      triggerType: 'manual_trigger',
      actions: ['get data from Google Sheets', 'send it to Gmail'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((s) => s.defaultSuggestedNodeType)).toEqual([
      'manual_trigger',
      'google_sheets',
      'google_gmail',
    ]);
  });

  it('overrides a weak registered Function candidate when the step clearly targets Gmail', async () => {
    mockSteps([
      triggerStep,
      {
        stepId: 'action_get_data_from_google_sheets',
        stepText: 'get data from Google Sheets',
        intentClass: 'data_source',
        candidateNodeTypes: ['google_sheets'],
        defaultSuggestedNodeType: 'google_sheets',
        confidence: 0.96,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
      {
        stepId: 'action_send_summary_to_gmail',
        stepText: 'send the summary to Gmail',
        intentClass: 'communication',
        candidateNodeTypes: ['function'],
        defaultSuggestedNodeType: 'function',
        confidence: 0.86,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'get data from google sheets and send the summary to Gmail',
      triggerType: 'manual_trigger',
      actions: ['get data from Google Sheets', 'send the summary to Gmail'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sendStep = result.steps.find((s) => s.stepId === 'action_send_summary_to_gmail');
    expect(sendStep?.defaultSuggestedNodeType).toBe('google_gmail');
    expect(sendStep?.candidateNodeTypes).toEqual(['google_gmail']);
  });

  it('repairs missing Gmail coverage from dataFlows.to when AI only returns summarization', async () => {
    mockSteps([
      triggerStep,
      {
        stepId: 'action_get_data_from_google_sheets',
        stepText: 'get data from Google Sheets',
        intentClass: 'data_source',
        candidateNodeTypes: ['google_sheets'],
        defaultSuggestedNodeType: 'google_sheets',
        confidence: 0.96,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
      {
        stepId: 'action_summarize_data',
        stepText: 'Summarize the data',
        intentClass: 'transformation',
        candidateNodeTypes: ['ai_chat_model'],
        defaultSuggestedNodeType: 'ai_chat_model',
        confidence: 0.84,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'get data from google sheets and send the summari to Gmail',
      triggerType: 'manual_trigger',
      actions: ['get data from Google Sheets', 'Summarize the data'],
      dataFlows: [{ from: 'Google Sheets', to: 'Gmail', dataDescription: 'summary to Gmail' }],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((s) => s.defaultSuggestedNodeType)).toContain('google_gmail');
    expect(result.steps[result.steps.length - 1].defaultSuggestedNodeType).toBe('google_gmail');
  });

  it('repairs typo-shaped destination wording from the original intent', async () => {
    mockSteps([
      triggerStep,
      {
        stepId: 'action_get_data_from_google_sheets',
        stepText: 'get data from Google Sheets',
        intentClass: 'data_source',
        candidateNodeTypes: ['google_sheets'],
        defaultSuggestedNodeType: 'google_sheets',
        confidence: 0.96,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
      {
        stepId: 'action_summarize_data',
        stepText: 'Summarize the data',
        intentClass: 'transformation',
        candidateNodeTypes: ['ai_chat_model'],
        defaultSuggestedNodeType: 'ai_chat_model',
        confidence: 0.84,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'get data from google sheets and send the summari to Gmail',
      triggerType: 'manual_trigger',
      actions: ['get data from Google Sheets', 'Summarize the data'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((s) => s.defaultSuggestedNodeType)).toContain('google_gmail');
    expect(result.steps[result.steps.length - 1].defaultSuggestedNodeType).not.toBe('ai_chat_model');
  });

  it('keeps explicit summarization and also preserves Gmail delivery', async () => {
    mockSteps([
      triggerStep,
      {
        stepId: 'action_get_data_from_google_sheets',
        stepText: 'get data from Google Sheets',
        intentClass: 'data_source',
        candidateNodeTypes: ['google_sheets'],
        defaultSuggestedNodeType: 'google_sheets',
        confidence: 0.96,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
      {
        stepId: 'action_summarize_data',
        stepText: 'summarize it',
        intentClass: 'transformation',
        candidateNodeTypes: ['ai_chat_model'],
        defaultSuggestedNodeType: 'ai_chat_model',
        confidence: 0.88,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
      {
        stepId: 'action_send_to_gmail',
        stepText: 'send to Gmail',
        intentClass: 'communication',
        candidateNodeTypes: ['google_gmail'],
        defaultSuggestedNodeType: 'google_gmail',
        confidence: 0.97,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'get data from Google Sheets, summarize it, and send to Gmail',
      triggerType: 'manual_trigger',
      actions: ['get data from Google Sheets', 'summarize it', 'send to Gmail'],
      dataFlows: [{ from: 'summary', to: 'Gmail', dataDescription: 'summary to Gmail' }],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const selectedTypes = result.steps.map((s) => s.defaultSuggestedNodeType);
    expect(selectedTypes).toContain('google_gmail');
    expect(selectedTypes.some((type) => type === 'ai_chat_model' || type === 'text_summarizer')).toBe(true);
  });

  it('repairs missing non-Gmail destination coverage generically', async () => {
    mockSteps([
      triggerStep,
      {
        stepId: 'action_get_data_from_google_sheets',
        stepText: 'get data from Google Sheets',
        intentClass: 'data_source',
        candidateNodeTypes: ['google_sheets'],
        defaultSuggestedNodeType: 'google_sheets',
        confidence: 0.96,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
      {
        stepId: 'action_summarize_data',
        stepText: 'Summarize the data',
        intentClass: 'transformation',
        candidateNodeTypes: ['ai_chat_model'],
        defaultSuggestedNodeType: 'ai_chat_model',
        confidence: 0.84,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'get data from Google Sheets and send the summary to Slack',
      triggerType: 'manual_trigger',
      actions: ['get data from Google Sheets', 'Summarize the data'],
      dataFlows: [{ from: 'summary', to: 'Slack', dataDescription: 'summary to Slack' }],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((s) => s.defaultSuggestedNodeType)).toContain('slack_message');
  });

  it('falls back to deterministic registry selection when AI returns invalid JSON', async () => {
    mockedProcessRequest.mockResolvedValue('not-json');

    const result = await runCapabilitySelectionStage({
      intent: 'Get rows from Google Sheets and send the result to Gmail',
      triggerType: 'manual_trigger',
      actions: ['get rows from Google Sheets', 'send the result to Gmail'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((s) => s.defaultSuggestedNodeType)).toEqual([
      'manual_trigger',
      'google_sheets',
      'google_gmail',
    ]);
    expect(result.steps.every((s) => s.ambiguous === false)).toBe(true);
  });

  it('falls back to deterministic registry selection when the AI call fails', async () => {
    mockedProcessRequest.mockRejectedValue(new Error('provider unavailable'));

    const result = await runCapabilitySelectionStage({
      intent: 'Get rows from Google Sheets and send the result to Gmail',
      triggerType: 'manual_trigger',
      actions: ['get rows from Google Sheets', 'send the result to Gmail'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((s) => s.defaultSuggestedNodeType)).toEqual([
      'manual_trigger',
      'google_sheets',
      'google_gmail',
    ]);
  });

  it('adds a registry trigger step when AI omits the trigger', async () => {
    mockSteps([
      {
        stepId: 'action_send_to_gmail',
        stepText: 'send it to Gmail',
        intentClass: 'communication',
        candidateNodeTypes: ['google_gmail'],
        defaultSuggestedNodeType: 'google_gmail',
        confidence: 0.97,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: 'send it to Gmail',
      triggerType: 'manual_trigger',
      actions: ['send it to Gmail'],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].intentClass).toBe('trigger');
    expect(result.steps[0].defaultSuggestedNodeType).toBe('manual_trigger');
  });

  it.each(['gmail', 'email', 'mail'])('does not route %s prompts to AI model nodes', async (word) => {
    mockSteps([
      triggerStep,
      {
        stepId: `action_send_${word}`,
        stepText: `send ${word}`,
        intentClass: 'communication',
        candidateNodeTypes: [word],
        defaultSuggestedNodeType: word,
        confidence: 0.9,
        ambiguous: false,
        selectionPolicy: { multiSelectAllowed: true, required: true },
      },
    ]);

    const result = await runCapabilitySelectionStage({
      intent: `send ${word}`,
      triggerType: 'manual_trigger',
      actions: [`send ${word}`],
      dataFlows: [],
      constraints: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const candidates = firstActionStep(result.steps)?.candidateNodeTypes || [];
    expect(candidates).not.toContain('ollama');
    expect(candidates).not.toContain('ai_chat_model');
  });

  it('keeps legacy mail aliases on Gmail while registry-derived aliases resolve catalog phrases', () => {
    expect(unifiedNodeRegistry.resolveAlias('gmail')).toBe('google_gmail');
    expect(unifiedNodeRegistry.resolveAlias('mail')).toBe('google_gmail');
    expect(unifiedNodeRegistry.resolveAlias('google sheets')).toBe('google_sheets');
    expect(unifiedNodeRegistry.resolveAlias('sheets')).toBe('google_sheets');
  });
});
