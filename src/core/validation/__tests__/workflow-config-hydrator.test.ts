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
            config: { userInput: 'hello', chat_model: {}, _fillMode: {} },
          },
        },
      ],
      edges: [],
    } as any);

    const cfg = (wf.nodes[0] as any).data.config;
    expect(cfg.chat_model).toBeDefined();
    expect(typeof cfg.chat_model).toBe('object');
    expect(Object.keys(cfg.chat_model).length).toBeGreaterThan(0);
  });
});
