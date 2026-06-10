import { getGeminiWalletContext, runWithGeminiWalletContext } from '../gemini-wallet-context';

describe('gemini-wallet-context', () => {
  it('starts without an ambient wallet context', () => {
    expect(getGeminiWalletContext()).toBeUndefined();
  });

  it('exposes the supplied context inside the callback and returns its value', () => {
    const result = runWithGeminiWalletContext({ userId: 'user-123' }, () => {
      return getGeminiWalletContext()?.userId;
    });

    expect(result).toBe('user-123');
    expect(getGeminiWalletContext()).toBeUndefined();
  });

  it('restores the outer context after a nested context finishes', () => {
    runWithGeminiWalletContext({ userId: 'outer-user' }, () => {
      expect(getGeminiWalletContext()?.userId).toBe('outer-user');

      runWithGeminiWalletContext({ userId: 'inner-user' }, () => {
        expect(getGeminiWalletContext()?.userId).toBe('inner-user');
      });

      expect(getGeminiWalletContext()?.userId).toBe('outer-user');
    });

    expect(getGeminiWalletContext()).toBeUndefined();
  });

  it('preserves the context through awaited work', async () => {
    const seenUserId = await runWithGeminiWalletContext({ userId: 'async-user' }, async () => {
      await Promise.resolve();
      return getGeminiWalletContext()?.userId;
    });

    expect(seenUserId).toBe('async-user');
    expect(getGeminiWalletContext()).toBeUndefined();
  });
});
