import { hydrateRequiredConfigFromRegistryDefaults } from '../workflow-config-hydrator';

describe('workflow-config-hydrator', () => {
  it('hydrates empty ai_agent.chat_model from registry defaults', () => {
    const wf = hydrateRequiredConfigFromRegistryDefaults({
      nodes: [
        {
          id: 'n1',
          type: 'ai_agent',
          data: {
            label: 'AI Agent',
            type: 'ai_agent',
            category: 'ai',
            config: { userInput: 'hello', chat_model: {}, _fillMode: { chat_model: 'manual_static' } },
          },
        },
      ],
      edges: [],
    } as any);

    const cfg = (wf.nodes[0] as any).data.config;
    expect(cfg.chat_model).toBeDefined();
    expect(typeof cfg.chat_model).toBe('object');
  });

  it('does not hydrate empty runtime-owned fields during build/save', () => {
    const wf = hydrateRequiredConfigFromRegistryDefaults({
      nodes: [
        {
          id: 'n1',
          type: 'ai_agent',
          data: {
            label: 'AI Agent',
            type: 'ai_agent',
            category: 'ai',
            config: { userInput: 'hello', chat_model: {}, _fillMode: { chat_model: 'runtime_ai' } },
          },
        },
      ],
      edges: [],
    } as any);

    const cfg = (wf.nodes[0] as any).data.config;
    expect(cfg.chat_model).toEqual({});
  });
});
