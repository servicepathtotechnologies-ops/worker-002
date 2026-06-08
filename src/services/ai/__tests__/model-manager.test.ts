import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_LITE_MODEL,
  GEMINI_MODELS,
  GEMINI_PRO_MODEL,
} from '../gemini-models';
import { ModelManager, modelManager } from '../model-manager';

describe('ModelManager', () => {
  let manager: ModelManager;

  beforeEach(() => {
    manager = new ModelManager();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exposes initialized Gemini model info and returns null for unknown models', () => {
    for (const model of GEMINI_MODELS) {
      expect(manager.getModelInfo(model)).toMatchObject({
        name: model,
        capabilities: expect.arrayContaining([
          'text-generation',
          'chat',
          'reasoning',
          'workflow-generation',
        ]),
        loaded: true,
        usageCount: 0,
      });
    }

    expect(manager.getModelInfo('not-a-gemini-model')).toBeNull();
  });

  it('tracks known model usage counts and last-used timestamps', () => {
    const now = new Date('2026-06-08T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    manager.trackUsage(GEMINI_DEFAULT_MODEL);
    manager.trackUsage(GEMINI_DEFAULT_MODEL);

    expect(manager.getModelInfo(GEMINI_DEFAULT_MODEL)).toMatchObject({
      usageCount: 2,
      lastUsed: now,
    });
    expect(manager.getUsageStats()[GEMINI_DEFAULT_MODEL]).toMatchObject({
      usageCount: 2,
      lastUsed: now,
      capabilities: expect.arrayContaining(['workflow-generation']),
      size: expect.stringContaining('0.075/0.30'),
    });
  });

  it('tracks unknown model usage with default metadata in stats', () => {
    manager.trackUsage('external-model');

    expect(manager.getUsageStats()['external-model']).toEqual({
      usageCount: 1,
      lastUsed: undefined,
      capabilities: [],
      size: 'Unknown',
    });
  });

  it('recommends the default and pro Gemini models', () => {
    expect(manager.getRecommendedModels()).toEqual([GEMINI_DEFAULT_MODEL, GEMINI_PRO_MODEL]);
  });

  it('normalizes legacy primary models before building fallbacks', () => {
    expect(manager.getFallbackModels('gemini-2.5-flash')).toEqual([
      GEMINI_PRO_MODEL,
      GEMINI_LITE_MODEL,
    ]);
    expect(manager.getFallbackModels(GEMINI_PRO_MODEL)).toEqual([
      GEMINI_DEFAULT_MODEL,
      GEMINI_LITE_MODEL,
    ]);
  });

  it('exports a singleton manager through the same public API', () => {
    expect(modelManager.getRecommendedModels()).toEqual([GEMINI_DEFAULT_MODEL, GEMINI_PRO_MODEL]);
    expect(modelManager.getModelInfo(GEMINI_LITE_MODEL)).toMatchObject({
      name: GEMINI_LITE_MODEL,
      loaded: true,
    });
  });
});
