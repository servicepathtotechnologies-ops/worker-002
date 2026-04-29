import * as fs from 'fs';
import * as path from 'path';
import { getConnectionCatalog } from '../../../api/connections-catalog';
import { connectorRegistry } from '../../connectors/connector-registry';
import { CredentialResolver } from '../credential-resolver';
import { nodeLibrary } from '../../nodes/node-library';

const WORKER_SRC = path.resolve(__dirname, '../../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(WORKER_SRC, relPath), 'utf-8');
}

describe('connection runtime alignment', () => {
  it('maps every connector node type to exactly one catalog entry by vaultKey', () => {
    const catalog = getConnectionCatalog();
    const catalogByVaultKey = new Map(catalog.map((entry) => [entry.vaultKey, entry]));

    for (const connector of connectorRegistry.getAllConnectors()) {
      const entry = catalogByVaultKey.get(connector.credentialContract.vaultKey);
      expect(entry).toBeDefined();
      for (const nodeType of connector.nodeTypes) {
        expect(entry?.nodeTypes).toContain(nodeType);
      }
    }
  });

  it('credential resolver reads contracts from ConnectorRegistry with the same vaultKey', () => {
    const resolver = new CredentialResolver(nodeLibrary);

    for (const connector of connectorRegistry.getAllConnectors()) {
      for (const nodeType of connector.nodeTypes) {
        const contracts = resolver.getCredentialContracts(nodeType);
        expect(contracts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              provider: connector.credentialContract.provider,
              type: connector.credentialContract.type,
              vaultKey: connector.credentialContract.vaultKey,
            }),
          ])
        );
      }
    }
  });

  it('manual credential catalog entries expose fields for non-dashboard OAuth contracts', () => {
    const catalog = getConnectionCatalog();
    const entriesByVaultKey = new Map(catalog.map((entry) => [entry.vaultKey, entry]));

    for (const connector of connectorRegistry.getAllConnectors()) {
      const entry = entriesByVaultKey.get(connector.credentialContract.vaultKey);
      expect(entry).toBeDefined();

      if (!entry?.oauthImplemented && connector.credentialContract.required) {
        expect(entry?.credentialFields.length).toBeGreaterThan(0);
      }
    }
  });

  it('runtime-sensitive generation paths do not use legacy credential systems', () => {
    const generationFiles = [
      'api/attach-inputs.ts',
      'api/attach-credentials.ts',
      'services/workflow-lifecycle-manager.ts',
      'services/ai/credential-discovery-phase.ts',
      'services/ai/credential-resolver.ts',
      'services/ai/tool-substitution-engine.ts',
      'services/ai/pipeline/workflow-generation-pipeline.ts',
      'services/ai/pipeline/backend-finalizer.ts',
    ];

    for (const file of generationFiles) {
      const source = read(file);
      expect(source).not.toContain(".from('credentials')");
      expect(source).not.toContain('.from("credentials")');
      expect(source).not.toMatch(/handled via navbar|navbar credentials|navbar button|integrated with Supabase/i);
    }
  });

  it('attach-inputs injects satisfied OAuth refs using vaultKey rather than scope-derived ids', () => {
    const source = read('api/attach-inputs.ts');
    expect(source).toContain('satisfiedCred.vaultKey');
    expect(source).not.toContain('`${satisfiedCred.provider}_${satisfiedCred.type}_${scopeSignature}`');
  });
});
