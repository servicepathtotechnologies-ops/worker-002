import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_LITE_MODEL,
  GEMINI_MODELS,
  GEMINI_PRO_MODEL,
  normalizeGeminiModel,
} from '../gemini-models';
import { GeminiOrchestrator } from '../gemini-orchestrator';
import { ModelManager } from '../model-manager';

describe('Gemini 3 model routing', () => {
  it('publishes only the verified Gemini 3 model set', () => {
    expect(GEMINI_MODELS).toEqual([
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite',
    ]);
  });

  it('normalizes old saved Gemini model IDs to verified model IDs', () => {
    expect(normalizeGeminiModel('gemini-2.5-flash')).toBe(GEMINI_DEFAULT_MODEL);
    expect(normalizeGeminiModel('gemini-2.5-pro')).toBe(GEMINI_PRO_MODEL);
    expect(normalizeGeminiModel('gemini-3.1-pro')).toBe(GEMINI_PRO_MODEL);
    expect(normalizeGeminiModel('gemini-3-flash-preview')).toBe(GEMINI_LITE_MODEL);
    expect(normalizeGeminiModel('gemini-1.5-flash')).toBe(GEMINI_DEFAULT_MODEL);
  });

  it('model manager recommends and falls back within the verified model set', () => {
    const manager = new ModelManager();

    expect(manager.getRecommendedModels()).toEqual([GEMINI_DEFAULT_MODEL, GEMINI_PRO_MODEL]);
    expect(manager.getFallbackModels(GEMINI_PRO_MODEL)).toEqual([GEMINI_DEFAULT_MODEL, GEMINI_LITE_MODEL]);
    expect(manager.getFallbackModels('gemini-2.5-flash')).toEqual([GEMINI_PRO_MODEL, GEMINI_LITE_MODEL]);
  });

  it('orchestrator routes request types to the expected Gemini 3 roles', () => {
    const orchestrator = new GeminiOrchestrator() as any;

    expect(orchestrator.selectOptimalModel('workflow-generation', {})).toBe(GEMINI_PRO_MODEL);
    expect(orchestrator.selectOptimalModel('code-generation', {})).toBe(GEMINI_PRO_MODEL);
    expect(orchestrator.selectOptimalModel('summarization', {})).toBe(GEMINI_LITE_MODEL);
    expect(orchestrator.selectOptimalModel('translation', {})).toBe(GEMINI_LITE_MODEL);
    expect(orchestrator.selectOptimalModel('entity-extraction', {})).toBe(GEMINI_LITE_MODEL);
    expect(orchestrator.selectOptimalModel('chat-generation', {})).toBe(GEMINI_DEFAULT_MODEL);
  });
});
