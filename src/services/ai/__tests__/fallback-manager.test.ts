import { FallbackManager } from '../fallback-manager';
import { modelManager } from '../model-manager';

jest.mock('../model-manager', () => ({
  modelManager: {
    getFallbackModels: jest.fn().mockReturnValue([]),
  },
}));

const mockedGetFallbackModels = jest.mocked(modelManager.getFallbackModels);

describe('FallbackManager', () => {
  let manager: FallbackManager;

  beforeEach(() => {
    manager = new FallbackManager();
    mockedGetFallbackModels.mockReturnValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getFallbackStrategy', () => {
    it('returns correct models for text-generation', () => {
      expect(manager.getFallbackStrategy('text-generation')).toEqual([
        'qwen2.5:14b-instruct-q4_K_M',
        'qwen2.5-coder:7b-instruct-q4_K_M',
      ]);
    });

    it('returns correct models for code-generation', () => {
      expect(manager.getFallbackStrategy('code-generation')).toEqual([
        'qwen2.5-coder:7b-instruct-q4_K_M',
        'qwen2.5:7b-instruct-q4_K_M',
      ]);
    });

    it('returns correct models for image-analysis', () => {
      expect(manager.getFallbackStrategy('image-analysis')).toEqual([
        'qwen2.5:14b-instruct-q4_K_M',
      ]);
    });

    it('returns correct models for chat', () => {
      expect(manager.getFallbackStrategy('chat')).toEqual([
        'qwen2.5:14b-instruct-q4_K_M',
        'qwen2.5:7b-instruct-q4_K_M',
      ]);
    });

    it('returns correct models for summarization', () => {
      expect(manager.getFallbackStrategy('summarization')).toEqual([
        'qwen2.5:14b-instruct-q4_K_M',
      ]);
    });

    it('returns correct models for translation', () => {
      expect(manager.getFallbackStrategy('translation')).toEqual([
        'qwen2.5:14b-instruct-q4_K_M',
      ]);
    });

    it('returns the default model for an unknown task type', () => {
      expect(manager.getFallbackStrategy('unknown-task')).toEqual([
        'qwen2.5:14b-instruct-q4_K_M',
      ]);
    });
  });

  describe('withFallback', () => {
    it('resolves with the action result when the first attempt succeeds', async () => {
      const action = jest.fn().mockResolvedValue('ok');
      const result = await manager.withFallback(action, 'primary-model', 1);
      expect(result).toBe('ok');
    });

    it('passes the primary model to the action on first call', async () => {
      const action = jest.fn().mockResolvedValue('ok');
      await manager.withFallback(action, 'primary-model', 1);
      expect(action).toHaveBeenCalledWith('primary-model');
    });

    it('tries the fallback model after primary fails all retries', async () => {
      mockedGetFallbackModels.mockReturnValue(['fallback-model']);
      const action = jest.fn()
        .mockRejectedValueOnce(new Error('primary down'))
        .mockResolvedValue('fallback ok');
      const result = await manager.withFallback(action, 'primary-model', 1);
      expect(result).toBe('fallback ok');
      expect(action).toHaveBeenNthCalledWith(1, 'primary-model');
      expect(action).toHaveBeenNthCalledWith(2, 'fallback-model');
    });

    it('throws when all models fail all retries', async () => {
      mockedGetFallbackModels.mockReturnValue(['fallback-model']);
      const action = jest.fn().mockRejectedValue(new Error('all down'));
      await expect(manager.withFallback(action, 'primary-model', 1)).rejects.toThrow(
        'All fallbacks failed for model primary-model'
      );
    });

    it('includes the last error message in the thrown error', async () => {
      mockedGetFallbackModels.mockReturnValue([]);
      const action = jest.fn().mockRejectedValue(new Error('very specific failure'));
      await expect(manager.withFallback(action, 'primary-model', 1)).rejects.toThrow(
        'very specific failure'
      );
    });

    it('calls action once per model when maxRetries is 1', async () => {
      mockedGetFallbackModels.mockReturnValue(['model-b', 'model-c']);
      const action = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(manager.withFallback(action, 'model-a', 1)).rejects.toThrow();
      expect(action).toHaveBeenCalledTimes(3);
    });
  });
});
