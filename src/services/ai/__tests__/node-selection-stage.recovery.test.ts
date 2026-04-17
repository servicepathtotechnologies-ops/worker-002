import { runNodeSelectionStage } from '../stages/node-selection-stage';

jest.mock('../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

const { geminiOrchestrator } = require('../gemini-orchestrator');

describe('node-selection-stage contract hardening', () => {
  const baseIntent = {
    intent: 'Send an email when manually triggered',
    triggerType: 'manual_trigger' as const,
    actions: ['send email'],
    dataFlows: [],
    constraints: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recovers deterministically when malformed outputs remain unparsable', async () => {
    geminiOrchestrator.processRequest
      .mockResolvedValueOnce('totally malformed output')
      .mockResolvedValueOnce('still malformed output');

    const result = await runNodeSelectionStage(baseIntent, '[]', 'test-correlation-id');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selectedNodes.length).toBeGreaterThan(0);
      const triggerCount = result.selectedNodes.filter((n) => n.role === 'trigger').length;
      expect(triggerCount).toBe(1);
    }
  });

  it('accepts structured schema-valid object responses directly', async () => {
    geminiOrchestrator.processRequest.mockResolvedValueOnce({
      selectedNodes: [
        { type: 'manual_trigger', role: 'trigger', reason: 'User asked for manual start' },
        { type: 'google_gmail', role: 'action', reason: 'User asked to send email' },
      ],
    });

    const result = await runNodeSelectionStage(baseIntent, '[]', 'test-correlation-id');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selectedNodes.some((n) => n.type === 'manual_trigger')).toBe(true);
      expect(result.selectedNodes.some((n) => n.type === 'google_gmail')).toBe(true);
    }
  });
});
