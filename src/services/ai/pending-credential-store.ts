/**
 * Pending Credential Store
 *
 * In-memory store that holds user-entered credential values between the
 * credential panel interaction and the "Continue Workflow" confirmation step.
 *
 * Keyed by workflowId. Values are a nested map of provider → { fieldName → value }.
 * Cleared after successful workflow confirmation.
 *
 * Requirements: 3.1, 3.2, 3.8
 */

/** provider → { fieldName → value } */
export type PendingCredentials = Record<string, Record<string, string>>;

export class PendingCredentialStore {
  private store: Map<string, PendingCredentials> = new Map();

  /**
   * Persist credential fields for a given workflowId + provider.
   * Merges into any existing entry for that provider.
   */
  set(workflowId: string, provider: string, fields: Record<string, string>): void {
    const existing = this.store.get(workflowId) ?? {};
    this.store.set(workflowId, {
      ...existing,
      [provider]: { ...(existing[provider] ?? {}), ...fields },
    });
  }

  /** Returns all pending credentials for a workflowId, or undefined if none. */
  get(workflowId: string): PendingCredentials | undefined {
    return this.store.get(workflowId);
  }

  /** Removes all pending credentials for a workflowId (call after successful confirmation). */
  clear(workflowId: string): void {
    this.store.delete(workflowId);
  }

  /** Returns true if there are any pending credentials for a workflowId. */
  has(workflowId: string): boolean {
    return this.store.has(workflowId);
  }
}

export const pendingCredentialStore = new PendingCredentialStore();
