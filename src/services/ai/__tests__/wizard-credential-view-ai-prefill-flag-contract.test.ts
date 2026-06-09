import { describe, expect, it } from '@jest/globals';
import { buildCredentialWizardView, type CredentialStatusRow } from '../wizard-credential-view';
import type { ComprehensiveNodeQuestion } from '../comprehensive-node-questions-generator';

const baseQuestion = (
  overrides: Partial<ComprehensiveNodeQuestion>,
): ComprehensiveNodeQuestion =>
  ({
    id: 'q_cred',
    text: 'API Key',
    type: 'password',
    nodeId: 'node_1',
    nodeType: 'generic_service',
    nodeLabel: 'Generic Service',
    fieldName: 'apiKey',
    category: 'credential',
    required: true,
    askOrder: 0,
    ...overrides,
  }) as ComprehensiveNodeQuestion;

describe('wizard credential view ai-prefill flag contract', () => {
  it('sets aiPrefilled when aiFilledAtBuildTime is true regardless of defaultValue', () => {
    const questions: ComprehensiveNodeQuestion[] = [
      baseQuestion({ aiFilledAtBuildTime: true }),
    ];
    const { rows } = buildCredentialWizardView(questions, []);
    expect(rows[0].aiPrefilled).toBe(true);
  });

  it('aiFilledAtBuildTime and requiresInput are computed independently', () => {
    // aiFilledAtBuildTime drives aiPrefilled; required_missing+credential drives requiresInput
    const questions: ComprehensiveNodeQuestion[] = [
      baseQuestion({ aiFilledAtBuildTime: true }),
    ];
    const statuses: CredentialStatusRow[] = [
      {
        nodeId: 'node_1',
        credentialId: 'apiKey',
        displayName: 'API Key',
        status: 'required_missing',
      },
    ];
    const { rows } = buildCredentialWizardView(questions, statuses);
    expect(rows[0].aiPrefilled).toBe(true);
    expect(rows[0].requiresInput).toBe(true);
  });

  it('does not set aiPrefilled when buildtime_ai_once is set but defaultValue is empty', () => {
    const questions: ComprehensiveNodeQuestion[] = [
      baseQuestion({ fillModeDefault: 'buildtime_ai_once' }),
    ];
    const { rows } = buildCredentialWizardView(questions, []);
    expect(rows[0].aiPrefilled).toBe(false);
  });

  it('does not set aiPrefilled when defaultValue is set but fillModeDefault is manual_static', () => {
    const questions: ComprehensiveNodeQuestion[] = [
      baseQuestion({ fillModeDefault: 'manual_static', defaultValue: 'some-static-value' }),
    ];
    const { rows } = buildCredentialWizardView(questions, []);
    expect(rows[0].aiPrefilled).toBe(false);
  });
});
