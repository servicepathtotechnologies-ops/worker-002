jest.mock('../../../shared/llm-adapter', () => ({
  LLMAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
  })),
}));

import { BuildtimeTextHelper } from '../buildtime-text-helper';
import { LLMAdapter } from '../../../shared/llm-adapter';

const MockLLMAdapter = LLMAdapter as unknown as jest.Mock;

function getChatMock(): jest.Mock {
  return MockLLMAdapter.mock.results.at(-1)?.value.chat as jest.Mock;
}

describe('BuildtimeTextHelper', () => {
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalGeminiApiKey;
  });

  it('creates one LLMAdapter instance per helper instance', () => {
    new BuildtimeTextHelper();

    expect(MockLLMAdapter).toHaveBeenCalledTimes(1);
  });

  it('calls Gemini with the build-time text prompt and deterministic options', async () => {
    const helper = new BuildtimeTextHelper();
    const chat = getChatMock();
    chat.mockResolvedValue({ content: 'Daily active users' });

    await helper.generateTextOnce({
      fieldName: 'metricDescription',
      nodeType: 'analytics_report',
      nodeLabel: 'Analytics Report',
      userIntent: 'Create a daily analytics report',
      upstreamSummary: 'Google Sheets provides user activity rows.',
    });

    expect(chat).toHaveBeenCalledWith(
      'gemini',
      [
        {
          role: 'system',
          content: expect.stringContaining('Return ONLY the text'),
        },
        {
          role: 'user',
          content: expect.stringContaining('Workflow node type: analytics_report'),
        },
      ],
      {
        model: 'gemini-3.5-flash',
        apiKey: 'test-gemini-key',
        temperature: 0.4,
      },
    );

    const userContent = chat.mock.calls[0][1][1].content;
    expect(userContent).toContain('Node label: Analytics Report');
    expect(userContent).toContain('Target field: metricDescription');
    expect(userContent).toContain('User intent / prompt:');
    expect(userContent).toContain('Create a daily analytics report');
    expect(userContent).toContain('Upstream data summary:');
    expect(userContent).toContain('Google Sheets provides user activity rows.');
  });

  it('omits optional nodeLabel and upstreamSummary sections when absent', async () => {
    const helper = new BuildtimeTextHelper();
    const chat = getChatMock();
    chat.mockResolvedValue({ content: 'Summarize customer feedback' });

    await helper.generateTextOnce({
      fieldName: 'prompt',
      nodeType: 'openai_gpt',
      userIntent: 'Summarize support tickets',
    });

    const userContent = chat.mock.calls[0][1][1].content;
    expect(userContent).toContain('Workflow node type: openai_gpt');
    expect(userContent).toContain('Target field: prompt');
    expect(userContent).toContain('Summarize support tickets');
    expect(userContent).not.toContain('Node label:');
    expect(userContent).not.toContain('Upstream data summary:');
  });

  it('returns the trimmed LLM content', async () => {
    const helper = new BuildtimeTextHelper();
    getChatMock().mockResolvedValue({ content: '  Clean static text  \n' });

    const result = await helper.generateTextOnce({
      fieldName: 'description',
      nodeType: 'slack_message',
      userIntent: 'Notify the team',
    });

    expect(result).toBe('Clean static text');
  });

  it('returns an empty string when the adapter response has no content', async () => {
    const helper = new BuildtimeTextHelper();
    getChatMock().mockResolvedValue({});

    const result = await helper.generateTextOnce({
      fieldName: 'description',
      nodeType: 'log_output',
      userIntent: 'Log audit details',
    });

    expect(result).toBe('');
  });

  it('propagates LLM adapter failures to the caller', async () => {
    const helper = new BuildtimeTextHelper();
    getChatMock().mockRejectedValue(new Error('Gemini unavailable'));

    await expect(
      helper.generateTextOnce({
        fieldName: 'description',
        nodeType: 'google_gmail',
        userIntent: 'Send a follow-up email',
      }),
    ).rejects.toThrow('Gemini unavailable');
  });
});
