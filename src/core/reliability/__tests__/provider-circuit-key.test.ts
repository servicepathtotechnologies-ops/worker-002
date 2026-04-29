import { getProviderCircuitKeyFromNodeType } from '../provider-circuit-key';

describe('provider circuit key mapping', () => {
  it('maps known providers', () => {
    expect(getProviderCircuitKeyFromNodeType('google_gmail')).toBe('provider:google');
    expect(getProviderCircuitKeyFromNodeType('slack_message')).toBe('provider:slack');
    expect(getProviderCircuitKeyFromNodeType('ai_chat_model')).toBe('provider:ai');
  });

  it('falls back to first prefix provider', () => {
    expect(getProviderCircuitKeyFromNodeType('custom_service_action')).toBe('provider:custom');
  });
});
