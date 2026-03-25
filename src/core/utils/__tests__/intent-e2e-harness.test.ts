import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { runNodeRegistryGates } from '../node-registry-gates';

describe('intent-e2e harness (fixtures + registry)', () => {
  it('scenario-gmail-send.json aligns with unified registry', () => {
    const fixturePath = path.join(__dirname, '../../../../test/fixtures/intent-e2e/scenario-gmail-send.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const scenario = JSON.parse(raw) as {
      nodeType: string;
      expectations: { registrySubjectFillMode?: string; requiredCredentialProviderHint?: string };
    };

    const def = unifiedNodeRegistry.get(scenario.nodeType);
    expect(def).toBeDefined();

    const subject = def!.inputSchema.subject;
    expect(subject?.fillMode?.default).toBe(scenario.expectations.registrySubjectFillMode);

    const pre = unifiedNodeRegistry.getCredentialPreflightDescriptor(scenario.nodeType);
    expect(pre.requiresCheck).toBe(true);
    expect(pre.lookupKeys.join('|')).toContain(scenario.expectations.requiredCredentialProviderHint!);

    expect(runNodeRegistryGates()).toEqual([]);
  });

  it('covers core categories with registry presence', () => {
    for (const t of ['manual_trigger', 'google_gmail', 'http_request', 'if_else', 'openai_gpt']) {
      expect(unifiedNodeRegistry.get(t)).toBeDefined();
    }
  });
});
