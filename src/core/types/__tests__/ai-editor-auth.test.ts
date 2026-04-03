import {
  capabilitiesForRole,
  assertCanApply,
  normalizeAppRole,
  hasCapability,
} from '../ai-editor-auth';

describe('ai-editor-auth', () => {
  test('capabilitiesForRole: user is analyze-only', () => {
    const caps = capabilitiesForRole('user');
    expect(hasCapability(caps, 'ai_editor:analyze')).toBe(true);
    expect(hasCapability(caps, 'ai_editor:suggest')).toBe(false);
    expect(hasCapability(caps, 'ai_editor:apply_draft')).toBe(false);
    expect(hasCapability(caps, 'ai_editor:apply_live')).toBe(false);
  });

  test('capabilitiesForRole: moderator can suggest and apply draft', () => {
    const caps = capabilitiesForRole('moderator');
    expect(hasCapability(caps, 'ai_editor:suggest')).toBe(true);
    expect(hasCapability(caps, 'ai_editor:apply_draft')).toBe(true);
    expect(hasCapability(caps, 'ai_editor:apply_live')).toBe(false);
  });

  test('capabilitiesForRole: admin can apply live', () => {
    const caps = capabilitiesForRole('admin');
    expect(hasCapability(caps, 'ai_editor:apply_live')).toBe(true);
  });

  test('assertCanApply: draft requires apply_draft', () => {
    const mod = capabilitiesForRole('moderator');
    expect(assertCanApply(mod, 'draft').ok).toBe(true);
    const user = capabilitiesForRole('user');
    expect(assertCanApply(user, 'draft').ok).toBe(false);
  });

  test('assertCanApply: active requires apply_live', () => {
    const mod = capabilitiesForRole('moderator');
    const r = assertCanApply(mod, 'active');
    expect(r.ok).toBe(false);
    const admin = capabilitiesForRole('admin');
    expect(assertCanApply(admin, 'active').ok).toBe(true);
  });

  test('normalizeAppRole picks highest privilege', () => {
    expect(
      normalizeAppRole([{ role: 'user' }, { role: 'admin' }, { role: 'moderator' }])
    ).toBe('admin');
  });
});
