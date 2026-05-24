import { classifyGeminiWalletError } from '../gemini-wallet-service';

describe('Gemini wallet error classification', () => {
  it('classifies invalid API key errors', () => {
    const result = classifyGeminiWalletError(new Error('Gemini API error: 400 - API key not valid'));

    expect(result.status).toBe('invalid');
    expect(result.code).toBe('GEMINI_WALLET_INVALID');
  });

  it('classifies quota and billing exhaustion', () => {
    const result = classifyGeminiWalletError(new Error('Gemini API error: 429 - RESOURCE_EXHAUSTED quota exceeded'));

    expect(result.status).toBe('quota_exceeded');
    expect(result.code).toBe('GEMINI_WALLET_LIMIT_EXCEEDED');
  });

  it('classifies other Gemini failures as provider errors', () => {
    const result = classifyGeminiWalletError(new Error('Gemini API error: 503 - service unavailable'));

    expect(result.status).toBe('error');
    expect(result.code).toBe('GEMINI_WALLET_PROVIDER_ERROR');
  });
});
