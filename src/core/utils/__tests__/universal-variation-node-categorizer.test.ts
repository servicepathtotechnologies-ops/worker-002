import { UniversalVariationNodeCategorizer } from '../universal-variation-node-categorizer';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';

jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    getAllTypes: jest.fn(),
    get: jest.fn(),
  },
}));

const mockGetAllTypes = unifiedNodeRegistry.getAllTypes as jest.Mock;
const mockGet = unifiedNodeRegistry.get as jest.Mock;

function makeDef(overrides: {
  category?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
} = {}): object {
  return {
    category: overrides.category ?? 'action',
    description: overrides.description ?? '',
    tags: overrides.tags ?? [],
    aliases: overrides.aliases ?? [],
  };
}

describe('UniversalVariationNodeCategorizer', () => {
  let categorizer: UniversalVariationNodeCategorizer;

  beforeEach(() => {
    jest.clearAllMocks();
    categorizer = UniversalVariationNodeCategorizer.getInstance();
    categorizer.clearCache();
  });

  // ─── Singleton ───────────────────────────────────────────────────────────────

  it('getInstance returns the same instance each time', () => {
    const a = UniversalVariationNodeCategorizer.getInstance();
    const b = UniversalVariationNodeCategorizer.getInstance();
    expect(a).toBe(b);
  });

  // ─── getHelperNodes ───────────────────────────────────────────────────────────

  it('getHelperNodes returns empty array when no nodes match', () => {
    mockGetAllTypes.mockReturnValue(['noop_action']);
    mockGet.mockReturnValue(makeDef({ category: 'action' }));

    expect(categorizer.getHelperNodes()).toEqual([]);
  });

  it('getHelperNodes includes utility-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['cache_manager']);
    mockGet.mockReturnValue(makeDef({ category: 'utility' }));

    const result = categorizer.getHelperNodes();
    expect(result).toContain('cache_manager');
  });

  it('getHelperNodes includes logic-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['logic_switch']);
    mockGet.mockReturnValue(makeDef({ category: 'logic' }));

    const result = categorizer.getHelperNodes();
    expect(result).toContain('logic_switch');
  });

  it('getHelperNodes excludes trigger-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['webhook_trigger']);
    mockGet.mockReturnValue(makeDef({ category: 'trigger' }));

    expect(categorizer.getHelperNodes()).toEqual([]);
  });

  it('getHelperNodes excludes data-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['data_source']);
    mockGet.mockReturnValue(makeDef({ category: 'data' }));

    expect(categorizer.getHelperNodes()).toEqual([]);
  });

  it('getHelperNodes excludes communication-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['email_send']);
    mockGet.mockReturnValue(makeDef({ category: 'communication' }));

    expect(categorizer.getHelperNodes()).toEqual([]);
  });

  it('getHelperNodes scores type-name keyword match', () => {
    mockGetAllTypes.mockReturnValue(['delay_action', 'unrelated_action']);
    mockGet.mockImplementation((type: string) => {
      if (type === 'delay_action') return makeDef({ category: 'action', description: 'delays execution' });
      return makeDef({ category: 'action' });
    });

    const result = categorizer.getHelperNodes();
    expect(result).toContain('delay_action');
    expect(result).not.toContain('unrelated_action');
  });

  it('getHelperNodes scores description keyword match', () => {
    mockGetAllTypes.mockReturnValue(['my_throttler']);
    mockGet.mockReturnValue(makeDef({ category: 'action', description: 'throttle requests' }));

    const result = categorizer.getHelperNodes();
    expect(result).toContain('my_throttler');
  });

  it('getHelperNodes scores tags keyword match', () => {
    mockGetAllTypes.mockReturnValue(['my_splitter']);
    mockGet.mockReturnValue(makeDef({ category: 'action', tags: ['split', 'batch'] }));

    const result = categorizer.getHelperNodes();
    expect(result).toContain('my_splitter');
  });

  it('getHelperNodes scores aliases keyword match', () => {
    mockGetAllTypes.mockReturnValue(['wait_node']);
    mockGet.mockReturnValue(makeDef({ category: 'action', aliases: ['delay_alias'] }));

    const result = categorizer.getHelperNodes();
    expect(result).toContain('wait_node');
  });

  it('getHelperNodes respects excludeNodes list', () => {
    mockGetAllTypes.mockReturnValue(['cache_manager', 'delay_node']);
    mockGet.mockImplementation((type: string) => {
      if (type === 'cache_manager') return makeDef({ category: 'utility' });
      return makeDef({ category: 'action', description: 'delays execution' });
    });

    const result = categorizer.getHelperNodes(['cache_manager']);
    expect(result).not.toContain('cache_manager');
    expect(result).toContain('delay_node');
  });

  it('getHelperNodes sorts results by score descending', () => {
    mockGetAllTypes.mockReturnValue(['category_match', 'keyword_match']);
    mockGet.mockImplementation((type: string) => {
      if (type === 'category_match') return makeDef({ category: 'utility' }); // score 3
      // score 2 (type name "delay") only
      return makeDef({ category: 'action' });
    });
    // Override: keyword_match has type name with 'delay'
    mockGetAllTypes.mockReturnValue(['category_match', 'delay_keyword']);
    mockGet.mockImplementation((type: string) => {
      if (type === 'category_match') return makeDef({ category: 'utility' }); // score 3
      return makeDef({ category: 'action' }); // delay in type → score 2
    });

    const result = categorizer.getHelperNodes();
    expect(result.indexOf('category_match')).toBeLessThan(result.indexOf('delay_keyword'));
  });

  it('getHelperNodes uses cache on repeated call with same excludeNodes', () => {
    mockGetAllTypes.mockReturnValue(['cache_manager']);
    mockGet.mockReturnValue(makeDef({ category: 'utility' }));

    categorizer.getHelperNodes(['x']);
    categorizer.getHelperNodes(['x']);

    expect(mockGetAllTypes).toHaveBeenCalledTimes(1);
  });

  // ─── getProcessingNodes ───────────────────────────────────────────────────────

  it('getProcessingNodes includes transformation-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['data_transformer']);
    mockGet.mockReturnValue(makeDef({ category: 'transformation' }));

    expect(categorizer.getProcessingNodes()).toContain('data_transformer');
  });

  it('getProcessingNodes includes ai-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['llm_summarizer']);
    mockGet.mockReturnValue(makeDef({ category: 'ai' }));

    expect(categorizer.getProcessingNodes()).toContain('llm_summarizer');
  });

  it('getProcessingNodes excludes trigger-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['schedule_trigger']);
    mockGet.mockReturnValue(makeDef({ category: 'trigger' }));

    expect(categorizer.getProcessingNodes()).toEqual([]);
  });

  it('getProcessingNodes excludes communication-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['slack_send']);
    mockGet.mockReturnValue(makeDef({ category: 'communication' }));

    expect(categorizer.getProcessingNodes()).toEqual([]);
  });

  // ─── getStyleNodes ────────────────────────────────────────────────────────────

  it('getStyleNodes includes scheduling trigger (category=trigger + schedule in type)', () => {
    mockGetAllTypes.mockReturnValue(['schedule_trigger']);
    mockGet.mockReturnValue(makeDef({ category: 'trigger' }));

    expect(categorizer.getStyleNodes()).toContain('schedule_trigger');
  });

  it('getStyleNodes excludes plain triggers without scheduling keywords', () => {
    // Type name 'http_hook' has no keyword from the style semanticKeywords list
    mockGetAllTypes.mockReturnValue(['http_hook']);
    mockGet.mockReturnValue(makeDef({ category: 'trigger', description: 'fires on HTTP request' }));

    expect(categorizer.getStyleNodes()).toEqual([]);
  });

  it('getStyleNodes includes trigger with scheduling keyword in description', () => {
    mockGetAllTypes.mockReturnValue(['my_trigger']);
    mockGet.mockReturnValue(makeDef({ category: 'trigger', description: 'runs on a cron schedule' }));

    expect(categorizer.getStyleNodes()).toContain('my_trigger');
  });

  it('getStyleNodes excludes data-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['data_store']);
    mockGet.mockReturnValue(makeDef({ category: 'data' }));

    expect(categorizer.getStyleNodes()).toEqual([]);
  });

  it('getStyleNodes excludes communication-category nodes', () => {
    mockGetAllTypes.mockReturnValue(['email_node']);
    mockGet.mockReturnValue(makeDef({ category: 'communication' }));

    expect(categorizer.getStyleNodes()).toEqual([]);
  });

  // ─── getNodesByCategory ───────────────────────────────────────────────────────

  it('getNodesByCategory routes to getHelperNodes for helper', () => {
    mockGetAllTypes.mockReturnValue(['cache_manager']);
    mockGet.mockReturnValue(makeDef({ category: 'utility' }));

    const byCategory = categorizer.getNodesByCategory('helper');
    const direct = categorizer.getHelperNodes();
    expect(byCategory).toEqual(direct);
  });

  it('getNodesByCategory routes to getProcessingNodes for processing', () => {
    mockGetAllTypes.mockReturnValue(['data_transformer']);
    mockGet.mockReturnValue(makeDef({ category: 'transformation' }));

    const byCategory = categorizer.getNodesByCategory('processing');
    const direct = categorizer.getProcessingNodes();
    expect(byCategory).toEqual(direct);
  });

  it('getNodesByCategory routes to getStyleNodes for style', () => {
    mockGetAllTypes.mockReturnValue(['schedule_trigger']);
    mockGet.mockReturnValue(makeDef({ category: 'trigger' }));

    const byCategory = categorizer.getNodesByCategory('style');
    const direct = categorizer.getStyleNodes();
    expect(byCategory).toEqual(direct);
  });

  it('getNodesByCategory returns [] for unknown category', () => {
    // Cast to bypass TS for the unknown category test
    expect(categorizer.getNodesByCategory('unknown' as any)).toEqual([]);
  });

  // ─── clearCache ───────────────────────────────────────────────────────────────

  it('clearCache forces re-query on next call', () => {
    mockGetAllTypes.mockReturnValue(['cache_manager']);
    mockGet.mockReturnValue(makeDef({ category: 'utility' }));

    categorizer.getHelperNodes();
    categorizer.clearCache();
    categorizer.getHelperNodes();

    expect(mockGetAllTypes).toHaveBeenCalledTimes(2);
  });
});
