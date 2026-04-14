import { generateComprehensiveNodeQuestions } from '../comprehensive-node-questions-generator';
import type { Workflow } from '../../../core/types/ai-types';

describe('generateComprehensiveNodeQuestions + registry helpCategory', () => {
  it('asks for apiKey on openai_gpt via registry credential ownership (strict credential help categories)', () => {
    const wf: Workflow = {
      nodes: [
        {
          id: 'n1',
          type: 'openai_gpt',
          data: {
            label: 'GPT',
            type: 'openai_gpt',
            category: 'ai',
            config: {},
          },
        },
      ],
      edges: [],
    };
    const { questions } = generateComprehensiveNodeQuestions(wf, {}, { categories: ['credential'] });
    const apiKeyQ = questions.find((q) => q.fieldName.toLowerCase() === 'apikey' || q.fieldName === 'apiKey');
    expect(apiKeyQ).toBeDefined();
    expect(apiKeyQ?.category).toBe('credential');
  });

  it('does not treat spreadsheetId on google_sheets as a credential question (spreadsheet_id is value ownership)', () => {
    const wf: Workflow = {
      nodes: [
        {
          id: 'n1',
          type: 'google_sheets',
          data: {
            label: 'Sheets',
            type: 'google_sheets',
            category: 'data',
            config: {},
          },
        },
      ],
      edges: [],
    };
    const { questions } = generateComprehensiveNodeQuestions(wf, {}, { categories: ['credential'] });
    const spreadsheetQ = questions.find(
      (q) => q.fieldName.toLowerCase().includes('spreadsheet') || q.fieldName === 'spreadsheetId'
    );
    expect(spreadsheetQ).toBeUndefined();
  });

  it('includes webhookUrl prompt for slack_message in full configuration mode', () => {
    const wf: Workflow = {
      nodes: [
        {
          id: 'n1',
          type: 'slack_message',
          data: {
            label: 'Slack',
            type: 'slack_message',
            category: 'output',
            config: {},
          },
        },
      ],
      edges: [],
    };
    const { questions } = generateComprehensiveNodeQuestions(wf, {}, { mode: 'full_configuration' });
    const webhookQ = questions.find((q) => q.fieldName === 'webhookUrl');
    expect(webhookQ).toBeDefined();
  });

  it('deduplicates alias-equivalent fields by canonical field name', () => {
    const wf: Workflow = {
      nodes: [
        {
          id: 'n1',
          type: 'slack_message',
          data: {
            label: 'Slack',
            type: 'slack_message',
            category: 'communication',
            config: {},
          },
        },
      ],
      edges: [],
    };

    const { questions } = generateComprehensiveNodeQuestions(wf, {}, { mode: 'full_configuration' });
    const messageLike = questions.filter((q) => ['text', 'message'].includes(String(q.fieldName)));
    expect(messageLike.length).toBeLessThanOrEqual(1);
  });
});
