jest.mock('../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

import { geminiOrchestrator } from '../gemini-orchestrator';
import { PromptNormalizer } from '../prompt-normalizer';

const processRequestMock = geminiOrchestrator.processRequest as jest.MockedFunction<
  typeof geminiOrchestrator.processRequest
>;

function mockConsole() {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
}

describe('PromptNormalizer', () => {
  let normalizer: PromptNormalizer;

  beforeEach(() => {
    normalizer = new PromptNormalizer();
    processRequestMock.mockReset();
    mockConsole();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes a prompt from a valid JSON model response', async () => {
    processRequestMock.mockResolvedValueOnce(JSON.stringify({
      normalizedPrompt: 'When a webhook arrives, send a Slack message.',
      trigger: {
        type: 'webhook',
        description: 'Webhook receives a payload',
        detected: true,
      },
      actions: [
        {
          step: 1,
          description: 'Send Slack message',
          service: 'Slack',
          nodeType: 'slack_message',
        },
      ],
      output: {
        description: 'Slack notification',
        destination: 'Slack',
        format: 'message',
      },
      missingIntent: [],
      confidence: 0.92,
    }));

    const result = await normalizer.normalizePrompt('When webhook receives data, send Slack message');

    expect(result).toMatchObject({
      originalPrompt: 'When webhook receives data, send Slack message',
      normalizedPrompt: 'When a webhook arrives, send a Slack message.',
      trigger: {
        type: 'webhook',
        detected: true,
      },
      output: {
        destination: 'Slack',
      },
      confidence: 0.92,
    });
    expect(result.actions).toEqual([
      expect.objectContaining({
        step: 1,
        service: 'Slack',
        nodeType: 'slack_message',
      }),
    ]);
    expect(processRequestMock).toHaveBeenCalledWith(
      'workflow-generation',
      expect.objectContaining({
        prompt: expect.stringContaining('User Prompt: "When webhook receives data, send Slack message"'),
        system: expect.stringContaining('JSON-only response generator'),
      }),
      expect.objectContaining({
        temperature: 0.3,
        max_tokens: 2000,
      })
    );
  });

  it('extracts JSON from markdown or prose wrapped responses', async () => {
    processRequestMock.mockResolvedValueOnce(`Here is the normalized prompt:
\`\`\`json
{
  "normalizedPrompt": "On schedule, create a daily digest.",
  "trigger": {
    "type": "schedule",
    "description": "Daily schedule",
    "detected": true
  },
  "actions": [
    {
      "step": 1,
      "description": "Create daily digest",
      "service": "AI",
      "nodeType": "ai_agent"
    }
  ],
  "output": {
    "description": "Daily digest",
    "format": "summary"
  },
  "missingIntent": [],
  "confidence": 0.8
}
\`\`\``);

    const result = await normalizer.normalizePrompt('Schedule a daily AI digest');

    expect(result.normalizedPrompt).toBe('On schedule, create a daily digest.');
    expect(result.trigger.type).toBe('schedule');
    expect(result.actions).toEqual([
      expect.objectContaining({
        service: 'AI',
        nodeType: 'ai_agent',
      }),
    ]);
    expect(result.output.format).toBe('summary');
  });

  it('falls back to rule-based Gmail and generic email routing when models are unavailable', async () => {
    processRequestMock.mockRejectedValue(new Error('404 model not found'));

    const gmailResult = await normalizer.normalizePrompt('Daily send via Gmail to the customer');
    const emailResult = await normalizer.normalizePrompt('Send email to the customer');

    expect(gmailResult.trigger.type).toBe('schedule');
    expect(gmailResult.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        service: 'Gmail',
        nodeType: 'google_gmail',
      }),
    ]));
    expect(gmailResult.output.destination).toBe('Gmail');

    expect(emailResult.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        service: 'Email',
        nodeType: 'email',
      }),
    ]));
    expect(emailResult.output.destination).toBe('Email');
  });

  it('falls back with missing intent when no clear action is detected', async () => {
    processRequestMock.mockRejectedValueOnce(new Error('models not available'));

    const result = await normalizer.normalizePrompt('Webhook with customer payload');

    expect(result.trigger).toMatchObject({
      type: 'webhook',
      description: 'When webhook is called',
      detected: true,
    });
    expect(result.actions).toEqual([]);
    expect(result.missingIntent).toEqual(['No clear actions detected']);
    expect(result.confidence).toBe(0.6);
  });

  it('uses fallback when repeated model responses have extremely low confidence', async () => {
    processRequestMock.mockResolvedValue(JSON.stringify({
      normalizedPrompt: 'Unclear workflow',
      trigger: {
        type: 'manual_trigger',
        description: 'Unclear',
        detected: false,
      },
      actions: [],
      output: {
        description: 'Unclear',
      },
      missingIntent: ['Trigger and action are unclear'],
      confidence: 0.05,
    }));

    const result = await normalizer.normalizePrompt('Schedule daily Slack alert');

    expect(processRequestMock).toHaveBeenCalledTimes(3);
    expect(processRequestMock.mock.calls[1][2]).toMatchObject({
      temperature: 0.1,
      max_tokens: 1000,
    });
    expect(result).toMatchObject({
      trigger: {
        type: 'schedule',
      },
      output: {
        destination: 'Slack',
      },
      confidence: 0.6,
    });
    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        service: 'Slack',
        nodeType: 'slack_message',
      }),
    ]));
  });
});
