import '../src/core/env-loader';
import '../src/nodes/definitions';
import { registrySyncService } from '../src/credentials-system/registry-sync-service';

async function main() {
  const result = await registrySyncService.syncToDatabase();
  console.log('[CredentialRegistrySync] synced', result);
}

main().catch((error) => {
  console.error('[CredentialRegistrySync] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
