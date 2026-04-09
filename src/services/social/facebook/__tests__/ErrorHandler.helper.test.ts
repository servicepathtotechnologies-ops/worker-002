import { mapFacebookError, toFacebookErrorPayload } from '../shared/ErrorHandler.helper';

describe('Facebook ErrorHandler helper', () => {
  it('maps known Facebook error codes', () => {
    const mapped = mapFacebookError(190);
    expect(mapped).not.toBeNull();
    expect(mapped?.message).toContain('Access token expired');
  });

  it('falls back to generic payload for plain errors', () => {
    const payload = toFacebookErrorPayload(new Error('boom'));
    expect(payload.message).toBe('boom');
  });
});
