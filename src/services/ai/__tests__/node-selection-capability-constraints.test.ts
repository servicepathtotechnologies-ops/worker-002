import { describe, expect, it, jest } from '@jest/globals';
import { runNodeSelectionStage } from '../stages/node-selection-stage';
import { geminiOrchestrator } from '../gemini-orchestrator';
import type { StructuredIntent } from '../stages/intent-stage';

const SAMPLE_INTENT: StructuredIntent = {
  intent: 'Get sheet rows and send email',
  triggerType: 'manual_trigger',
  actions: ['get sheet rows', 'send email'],
  dataFlows: [],
  constraints: [],
};

describe('NodeSelectionStage capability constraints', () => {
  it('filters out nodes not in selected capability set', async () => {
    const spy = jest.spyOn(geminiOrchestrator, 'processRequest').mockResolvedValue(
      JSON.stringify({
        selectedNodes: [
          { type: 'manual_trigger', role: 'trigger', reason: 'trigger' },
          { type: 'google_sheets', role: 'action', reason: 'sheet read' },
          { type: 'slack_message', role: 'action', reason: 'notify' },
        ],
      }),
    );

    try {
      const result = await runNodeSelectionStage(
        SAMPLE_INTENT,
        JSON.stringify([]),
        'test-corr',
        undefined,
        {
          selectedNodeConstraintsFlat: ['manual_trigger', 'google_sheets', 'google_gmail'],
          requiredNodeTypes: ['manual_trigger', 'google_sheets', 'google_gmail'],
        },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const types = result.selectedNodes.map((n) => n.type);
      expect(types).toContain('manual_trigger');
      expect(types).toContain('google_sheets');
      expect(types).toContain('google_gmail');
      expect(types).not.toContain('slack_message');
    } finally {
      spy.mockRestore();
    }
  });
});

