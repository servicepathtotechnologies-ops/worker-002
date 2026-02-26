import { WorkflowNode } from '../builder/graphBuilder';

export interface CredentialQuestion {
  provider: string;
  question: string;
}

export interface CredentialVaultEntry {
  provider: string;
  data: Record<string, any>;
}

// Simple in-memory credential store for demo purposes
const credentialVault = new Map<string, CredentialVaultEntry>();

export function getRequiredProviders(nodes: WorkflowNode[]): string[] {
  const providers = new Set<string>();
  for (const node of nodes) {
    if (node.type && node.type !== 'trigger' && !node.type.startsWith('loop')) {
      providers.add(node.type);
    }
  }
  return Array.from(providers);
}

export function getMissingCredentialQuestions(nodes: WorkflowNode[]): CredentialQuestion[] {
  const providers = getRequiredProviders(nodes);
  const questions: CredentialQuestion[] = [];

  for (const provider of providers) {
    if (!credentialVault.has(provider)) {
      questions.push({
        provider,
        question: `Please provide credentials or connection details for ${provider}.`,
      });
    }
  }

  return questions;
}

export function storeCredential(provider: string, data: Record<string, any>): void {
  credentialVault.set(provider, { provider, data });
}

export function getCredential(provider: string): CredentialVaultEntry | undefined {
  return credentialVault.get(provider);
}

export default {
  getRequiredProviders,
  getMissingCredentialQuestions,
  storeCredential,
  getCredential,
};

