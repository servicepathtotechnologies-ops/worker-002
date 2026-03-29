/**
 * Maps a node's credential-owned config field to the vault key used by
 * credential discovery and attach-credentials (connector registry is source of truth).
 */

import { connectorRegistry } from '../../services/connectors/connector-registry';
import { nodeLibrary } from '../../services/nodes/node-library';

export type CredentialVaultMeta = { vaultKey: string; credentialId: string };

/**
 * Returns vault metadata when this field is the connector's primary credential field
 * for attach-credentials / filterCredentialQuestions matching.
 */
export function getCredentialVaultMetaForField(
  nodeType: string,
  fieldName: string
): CredentialVaultMeta | undefined {
  const canonical = nodeLibrary.getCanonicalType(nodeType);
  const connector = connectorRegistry.getConnectorByNodeType(canonical);
  if (!connector) return undefined;

  const cc = connector.credentialContract;
  const fl = fieldName.toLowerCase();

  if (cc.credentialFieldName) {
    if (fieldName !== cc.credentialFieldName) return undefined;
  } else {
    switch (cc.type) {
      case 'webhook':
        if (!fl.includes('webhook') && !fl.includes('webhookurl')) return undefined;
        break;
      case 'oauth':
        if (
          !fl.includes('credential') &&
          fl !== 'credentialid' &&
          fl !== 'credential_id'
        ) {
          return undefined;
        }
        break;
      case 'token':
      case 'api_key':
      case 'basic_auth':
        if (
          !fl.includes('api') &&
          !fl.includes('token') &&
          !fl.includes('key') &&
          !fl.includes('secret') &&
          !fl.includes('password') &&
          !fl.includes('auth')
        ) {
          return undefined;
        }
        break;
      default:
        return undefined;
    }
  }

  const vk = String(cc.vaultKey || '').trim();
  if (!vk) return undefined;
  return { vaultKey: vk, credentialId: vk };
}
