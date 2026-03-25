import { describe, expect, it } from '@jest/globals';
import { buildUnifiedReadiness } from '../unified-readiness';

describe('unified readiness', () => {
  it('classifies structural/value/credential blockers from payload parts', () => {
    const out = buildUnifiedReadiness({
      phase: 'configuring_inputs',
      structuralDiagnostics: {
        errors: ['switch.cases missing'],
      },
      comprehensiveQuestions: [
        {
          id: 'q1',
          nodeId: 'n1',
          nodeLabel: 'Form',
          fieldName: 'fields',
          ownershipClass: 'structural',
          category: 'configuration',
        },
        {
          id: 'q2',
          nodeId: 'n2',
          nodeLabel: 'Gmail',
          fieldName: 'subject',
          ownershipClass: 'value',
          category: 'configuration',
          required: true,
          supportsRuntimeAI: true,
          fillModeDefault: 'manual_static',
        },
      ],
      discoveredCredentials: [{ credentialId: 'slack', displayName: 'Slack Webhook URL' }],
      credentialStatuses: [
        { credentialId: 'slack', displayName: 'Slack Webhook URL', status: 'required_missing' },
      ],
    });

    expect(out.phase).toBe('configuring_inputs');
    expect(out.structuralUnresolved.length).toBeGreaterThan(0);
    expect(out.valueFields.some((f) => f.fieldName === 'subject')).toBe(true);
    expect(out.credentials.missing.length).toBe(1);
    expect(out.blockingReasons.some((b) => b.code === 'structural_unresolved')).toBe(true);
    expect(out.blockingReasons.some((b) => b.code === 'credential_missing')).toBe(true);
    expect(out.blockingReasons.some((b) => b.code === 'ownership_selection_required')).toBe(true);
  });

  it('prefers credentialStatuses for missing list over discoveredCredentials fallback', () => {
    const out = buildUnifiedReadiness({
      phase: 'configuring_credentials',
      comprehensiveQuestions: [],
      discoveredCredentials: [
        { credentialId: 'slack', displayName: 'Slack Webhook URL' },
        { credentialId: 'smtp', displayName: 'SMTP' },
      ],
      credentialStatuses: [
        { credentialId: 'slack', displayName: 'Slack Webhook URL', status: 'required_missing' },
        { credentialId: 'google', displayName: 'Google OAuth', status: 'resolved_connected' },
      ],
    });

    expect(out.credentials.missing).toHaveLength(1);
    expect(out.credentials.missing[0].credentialId).toBe('slack');
    expect(out.credentials.satisfied.some((c) => c.credentialId === 'google')).toBe(true);
  });

  it('does not surface log_output.level as unresolved value ownership field', () => {
    const out = buildUnifiedReadiness({
      phase: 'configuring_inputs',
      comprehensiveQuestions: [
        {
          id: 'q-log',
          nodeId: 'n-log',
          nodeType: 'log_output',
          nodeLabel: 'Log Output',
          fieldName: 'level',
          ownershipClass: 'value',
          category: 'configuration',
          required: false,
        },
      ],
      discoveredCredentials: [],
      credentialStatuses: [],
    });
    expect(out.valueFields.some((f) => f.nodeType === 'log_output' && f.fieldName === 'level')).toBe(false);
  });
});
