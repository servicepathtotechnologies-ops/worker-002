import {
  PendingCredentialStore,
  pendingCredentialStore,
} from '../pending-credential-store';

describe('PendingCredentialStore', () => {
  it('returns undefined and has:false for an unknown workflow', () => {
    const store = new PendingCredentialStore();

    expect(store.get('missing-workflow')).toBeUndefined();
    expect(store.has('missing-workflow')).toBe(false);
  });

  it('stores credential fields by workflow and provider', () => {
    const store = new PendingCredentialStore();

    store.set('workflow-1', 'slack', {
      webhookUrl: 'https://hooks.slack.test/abc',
      channel: '#ops',
    });

    expect(store.has('workflow-1')).toBe(true);
    expect(store.get('workflow-1')).toEqual({
      slack: {
        webhookUrl: 'https://hooks.slack.test/abc',
        channel: '#ops',
      },
    });
  });

  it('merges additional fields into an existing provider entry', () => {
    const store = new PendingCredentialStore();

    store.set('workflow-1', 'google', { clientId: 'client-1' });
    store.set('workflow-1', 'google', { clientSecret: 'secret-1' });

    expect(store.get('workflow-1')).toEqual({
      google: {
        clientId: 'client-1',
        clientSecret: 'secret-1',
      },
    });
  });

  it('overwrites only the provided field when setting the same provider again', () => {
    const store = new PendingCredentialStore();

    store.set('workflow-1', 'gmail', {
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
    });
    store.set('workflow-1', 'gmail', { accessToken: 'new-token' });

    expect(store.get('workflow-1')).toEqual({
      gmail: {
        accessToken: 'new-token',
        refreshToken: 'refresh-token',
      },
    });
  });

  it('preserves credentials for other providers in the same workflow', () => {
    const store = new PendingCredentialStore();

    store.set('workflow-1', 'slack', { webhookUrl: 'slack-url' });
    store.set('workflow-1', 'gmail', { accessToken: 'gmail-token' });

    expect(store.get('workflow-1')).toEqual({
      slack: { webhookUrl: 'slack-url' },
      gmail: { accessToken: 'gmail-token' },
    });
  });

  it('isolates credentials between workflow IDs', () => {
    const store = new PendingCredentialStore();

    store.set('workflow-1', 'slack', { webhookUrl: 'workflow-1-url' });
    store.set('workflow-2', 'slack', { webhookUrl: 'workflow-2-url' });

    expect(store.get('workflow-1')).toEqual({
      slack: { webhookUrl: 'workflow-1-url' },
    });
    expect(store.get('workflow-2')).toEqual({
      slack: { webhookUrl: 'workflow-2-url' },
    });
  });

  it('clears only the requested workflow', () => {
    const store = new PendingCredentialStore();

    store.set('workflow-1', 'slack', { webhookUrl: 'workflow-1-url' });
    store.set('workflow-2', 'slack', { webhookUrl: 'workflow-2-url' });

    store.clear('workflow-1');

    expect(store.has('workflow-1')).toBe(false);
    expect(store.get('workflow-1')).toBeUndefined();
    expect(store.has('workflow-2')).toBe(true);
    expect(store.get('workflow-2')).toEqual({
      slack: { webhookUrl: 'workflow-2-url' },
    });
  });
});

describe('pendingCredentialStore singleton', () => {
  const workflowId = 'pending-store-singleton-test-workflow';

  afterEach(() => {
    pendingCredentialStore.clear(workflowId);
  });

  it('persists pending credentials through the exported singleton instance', () => {
    pendingCredentialStore.set(workflowId, 'stripe', { apiKey: 'stripe-key' });

    expect(pendingCredentialStore.has(workflowId)).toBe(true);
    expect(pendingCredentialStore.get(workflowId)).toEqual({
      stripe: { apiKey: 'stripe-key' },
    });
  });
});
