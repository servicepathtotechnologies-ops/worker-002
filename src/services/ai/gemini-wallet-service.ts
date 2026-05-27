import { queryAsService } from '../../core/database/db-pool';
import { connectionService } from '../../credentials-system/connection-service';

export type GeminiWalletStatus = 'empty' | 'active' | 'invalid' | 'quota_exceeded' | 'error' | 'disabled';

export interface GeminiWalletState {
  enabled: boolean;
  status: GeminiWalletStatus;
  hasKey: boolean;
  maskedKey: string | null;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  subscriptionFrozen: boolean;
}

export interface ActiveGeminiWallet {
  userId: string;
  connectionId: string;
  apiKey: string;
}

export class GeminiWalletError extends Error {
  code: 'GEMINI_WALLET_INVALID' | 'GEMINI_WALLET_LIMIT_EXCEEDED' | 'GEMINI_WALLET_PROVIDER_ERROR';
  walletStatus: GeminiWalletStatus;

  constructor(code: GeminiWalletError['code'], message: string, walletStatus: GeminiWalletStatus) {
    super(message);
    this.name = 'GeminiWalletError';
    this.code = code;
    this.walletStatus = walletStatus;
  }
}

type WalletRow = {
  user_id: string;
  provider: string;
  active_connection_id: string | null;
  enabled: boolean;
  status: GeminiWalletStatus;
  last_validated_at: string | null;
  last_used_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
};

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function publicMessageForStatus(status: GeminiWalletStatus): string | null {
  if (status === 'invalid') return 'Gemini rejected this API key. Replace it with a valid key from Google AI Studio.';
  if (status === 'quota_exceeded') return 'Your Gemini API key limit has been reached. Replace the key or turn off wallet mode and choose a plan.';
  if (status === 'error') return 'Gemini could not be reached with this key. Try again or replace the key.';
  return null;
}

function walletCodeForStatus(status: GeminiWalletStatus): GeminiWalletError['code'] {
  if (status === 'invalid') return 'GEMINI_WALLET_INVALID';
  if (status === 'quota_exceeded') return 'GEMINI_WALLET_LIMIT_EXCEEDED';
  return 'GEMINI_WALLET_PROVIDER_ERROR';
}

export function classifyGeminiWalletError(error: unknown): {
  status: GeminiWalletStatus;
  code: GeminiWalletError['code'];
  message: string;
} {
  const raw = error instanceof Error ? error.message : String(error || '');
  const lower = raw.toLowerCase();
  const statusMatch = raw.match(/Gemini API error:\s*(\d{3})/i);
  const statusCode = statusMatch ? Number(statusMatch[1]) : 0;

  if (
    statusCode === 401 ||
    statusCode === 400 ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('permission denied') ||
    lower.includes('unauthorized')
  ) {
    return {
      status: 'invalid',
      code: 'GEMINI_WALLET_INVALID',
      message: publicMessageForStatus('invalid')!,
    };
  }

  if (
    statusCode === 429 ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('billing') ||
    lower.includes('rate limit')
  ) {
    return {
      status: 'quota_exceeded',
      code: 'GEMINI_WALLET_LIMIT_EXCEEDED',
      message: publicMessageForStatus('quota_exceeded')!,
    };
  }

  return {
    status: 'error',
    code: 'GEMINI_WALLET_PROVIDER_ERROR',
    message: publicMessageForStatus('error')!,
  };
}

export class GeminiWalletService {
  async getState(userId: string): Promise<GeminiWalletState> {
    const row = await this.getSettingsRow(userId);
    if (!row || !row.active_connection_id) {
      return this.emptyState(row?.enabled ?? false, row?.status ?? 'empty');
    }

    let hasKey = false;
    let maskedKey: string | null = null;
    try {
      const connection = await connectionService.getDecryptedConnection(userId, row.active_connection_id);
      const apiKey = typeof connection.credentials.apiKey === 'string' ? connection.credentials.apiKey.trim() : '';
      hasKey = Boolean(apiKey);
      maskedKey = apiKey ? maskApiKey(apiKey) : null;
    } catch {
      hasKey = false;
      maskedKey = null;
    }

    const status = hasKey ? row.status : 'empty';
    return {
      enabled: Boolean(row.enabled),
      status,
      hasKey,
      maskedKey,
      lastValidatedAt: row.last_validated_at,
      lastUsedAt: row.last_used_at,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message || publicMessageForStatus(status),
      subscriptionFrozen: Boolean(row.enabled && status === 'active' && hasKey),
    };
  }

  async saveKey(userId: string, apiKey: string): Promise<GeminiWalletState> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new GeminiWalletError('GEMINI_WALLET_INVALID', 'Gemini API key is required.', 'invalid');
    }

    const testResult = await this.validateKey(trimmed);
    const existing = await this.getSettingsRow(userId);
    const metadata = { walletManaged: true, hiddenFromConnections: true, walletProvider: 'gemini' };
    const connection = existing?.active_connection_id
      ? await connectionService.updateConnection(userId, existing.active_connection_id, {
          name: 'Gemini API Wallet',
          credentials: { apiKey: trimmed },
          metadata,
          status: testResult.ok ? 'active' : 'error',
        })
      : await connectionService.createConnection({
          userId,
          name: 'Gemini API Wallet',
          credentialTypeId: 'gemini_api_key',
          credentials: { apiKey: trimmed },
          metadata,
        });

    await this.upsertSettings(userId, {
      activeConnectionId: connection.id,
      enabled: false,
      status: testResult.ok ? 'disabled' : testResult.status,
      lastValidatedAt: new Date().toISOString(),
      lastErrorCode: testResult.ok ? null : testResult.code,
      lastErrorMessage: testResult.ok ? null : testResult.message,
    });

    if (!testResult.ok) {
      throw new GeminiWalletError(testResult.code, testResult.message, testResult.status);
    }

    return this.getState(userId);
  }

  async testWallet(userId: string): Promise<GeminiWalletState> {
    const active = await this.getWalletConnection(userId);
    if (!active?.apiKey) {
      await this.upsertSettings(userId, { status: 'empty', enabled: false });
      return this.getState(userId);
    }

    const result = await this.validateKey(active.apiKey);
    const current = await this.getSettingsRow(userId);
    await this.upsertSettings(userId, {
      status: result.ok ? (current?.enabled ? 'active' : 'disabled') : result.status,
      lastValidatedAt: new Date().toISOString(),
      lastErrorCode: result.ok ? null : result.code,
      lastErrorMessage: result.ok ? null : result.message,
    });

    if (!result.ok) {
      throw new GeminiWalletError(result.code, result.message, result.status);
    }

    return this.getState(userId);
  }

  async activate(userId: string): Promise<GeminiWalletState> {
    const active = await this.getWalletConnection(userId);
    if (!active?.apiKey) {
      throw new GeminiWalletError('GEMINI_WALLET_INVALID', 'Add a Gemini API key before activating wallet mode.', 'invalid');
    }

    const result = await this.validateKey(active.apiKey);
    await this.upsertSettings(userId, {
      enabled: result.ok,
      status: result.ok ? 'active' : result.status,
      lastValidatedAt: new Date().toISOString(),
      lastErrorCode: result.ok ? null : result.code,
      lastErrorMessage: result.ok ? null : result.message,
    });

    if (!result.ok) {
      throw new GeminiWalletError(result.code, result.message, result.status);
    }

    return this.getState(userId);
  }

  async deactivate(userId: string): Promise<GeminiWalletState> {
    await this.upsertSettings(userId, { enabled: false, status: 'disabled' });
    return this.getState(userId);
  }

  async deleteWallet(userId: string): Promise<GeminiWalletState> {
    const row = await this.getSettingsRow(userId);
    if (row?.active_connection_id) {
      await connectionService.deleteConnection(userId, row.active_connection_id).catch(() => {});
    }
    await this.upsertSettings(userId, {
      activeConnectionId: null,
      enabled: false,
      status: 'empty',
      lastValidatedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    return this.getState(userId);
  }

  async getActiveWallet(userId?: string): Promise<ActiveGeminiWallet | null> {
    if (!userId) return null;
    const row = await this.getSettingsRow(userId);
    if (!row?.enabled || row.status !== 'active' || !row.active_connection_id) return null;
    const connection = await connectionService.getDecryptedConnection(userId, row.active_connection_id);
    if (connection.status !== 'active') return null;
    const apiKey = typeof connection.credentials.apiKey === 'string' ? connection.credentials.apiKey.trim() : '';
    if (!apiKey) return null;
    return { userId, connectionId: connection.id, apiKey };
  }

  async getBlockingError(userId?: string): Promise<GeminiWalletError | null> {
    if (!userId) return null;
    const state = await this.getState(userId);
    if (!state.enabled || !state.hasKey || state.status === 'active' || state.status === 'disabled' || state.status === 'empty') {
      return null;
    }
    const message = state.lastErrorMessage || publicMessageForStatus(state.status) || 'Gemini wallet mode needs attention before AI actions can continue.';
    return new GeminiWalletError(walletCodeForStatus(state.status), message, state.status);
  }

  async isActive(userId?: string): Promise<boolean> {
    return Boolean(await this.getActiveWallet(userId).catch(() => null));
  }

  async recordSuccess(input: {
    userId: string;
    model?: string;
    source?: string;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  }): Promise<void> {
    await Promise.allSettled([
      queryAsService(
        `UPDATE public.user_ai_wallet_settings
         SET last_used_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND provider = 'gemini'`,
        [input.userId],
      ),
      queryAsService(
        `INSERT INTO public.ai_wallet_usage_events (
           user_id, provider, model, source, prompt_tokens, completion_tokens, total_tokens, status
         )
         VALUES ($1, 'gemini', $2, $3, $4, $5, $6, 'success')`,
        [
          input.userId,
          input.model || null,
          input.source || null,
          Number(input.usage?.promptTokens || 0),
          Number(input.usage?.completionTokens || 0),
          Number(input.usage?.totalTokens || 0),
        ],
      ),
    ]);
  }

  async recordFailure(userId: string, error: unknown, source?: string, model?: string): Promise<GeminiWalletError> {
    const classified = classifyGeminiWalletError(error);
    await Promise.allSettled([
      this.upsertSettings(userId, {
        enabled: true,
        status: classified.status,
        lastErrorCode: classified.code,
        lastErrorMessage: classified.message,
      }),
      queryAsService(
        `INSERT INTO public.ai_wallet_usage_events (
           user_id, provider, model, source, status, error_code
         )
         VALUES ($1, 'gemini', $2, $3, 'error', $4)`,
        [userId, model || null, source || null, classified.code],
      ),
    ]);
    return new GeminiWalletError(classified.code, classified.message, classified.status);
  }

  private async getWalletConnection(userId: string): Promise<ActiveGeminiWallet | null> {
    const row = await this.getSettingsRow(userId);
    if (!row?.active_connection_id) return null;
    const connection = await connectionService.getDecryptedConnection(userId, row.active_connection_id);
    const apiKey = typeof connection.credentials.apiKey === 'string' ? connection.credentials.apiKey.trim() : '';
    return apiKey ? { userId, connectionId: connection.id, apiKey } : null;
  }

  private async validateKey(apiKey: string): Promise<
    | { ok: true }
    | { ok: false; status: Exclude<GeminiWalletStatus, 'empty' | 'active' | 'disabled'>; code: GeminiWalletError['code']; message: string }
  > {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Return the word ok.' }] }],
            generationConfig: { maxOutputTokens: 8, temperature: 0 },
          }),
        },
      );
      if (response.ok) return { ok: true };
      const body = await response.text().catch(() => '');
      const classified = classifyGeminiWalletError(new Error(`Gemini API error: ${response.status} - ${body}`));
      return { ok: false, status: classified.status as any, code: classified.code, message: classified.message };
    } catch (error) {
      const classified = classifyGeminiWalletError(error);
      return { ok: false, status: classified.status as any, code: classified.code, message: classified.message };
    }
  }

  private async getSettingsRow(userId: string): Promise<WalletRow | null> {
    const rows = await queryAsService(
      `SELECT user_id, provider, active_connection_id, enabled, status,
              last_validated_at, last_used_at, last_error_code, last_error_message
       FROM public.user_ai_wallet_settings
       WHERE user_id = $1 AND provider = 'gemini'
       LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  }

  private async upsertSettings(userId: string, patch: {
    activeConnectionId?: string | null;
    enabled?: boolean;
    status?: GeminiWalletStatus;
    lastValidatedAt?: string | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
  }): Promise<void> {
    await queryAsService(
      `INSERT INTO public.user_ai_wallet_settings (
         user_id, provider, active_connection_id, enabled, status,
         last_validated_at, last_error_code, last_error_message, updated_at
       )
       VALUES ($1, 'gemini', $2, COALESCE($3, false), COALESCE($4, 'empty'), $5, $6, $7, NOW())
       ON CONFLICT (user_id, provider) DO UPDATE SET
         active_connection_id = CASE WHEN $8::boolean THEN $2 ELSE user_ai_wallet_settings.active_connection_id END,
         enabled = COALESCE($3, user_ai_wallet_settings.enabled),
         status = COALESCE($4, user_ai_wallet_settings.status),
         last_validated_at = CASE WHEN $9::boolean THEN $5 ELSE user_ai_wallet_settings.last_validated_at END,
         last_error_code = $6,
         last_error_message = $7,
         updated_at = NOW()`,
      [
        userId,
        patch.activeConnectionId === undefined ? null : patch.activeConnectionId,
        patch.enabled === undefined ? null : patch.enabled,
        patch.status || null,
        patch.lastValidatedAt === undefined ? null : patch.lastValidatedAt,
        patch.lastErrorCode === undefined ? null : patch.lastErrorCode,
        patch.lastErrorMessage === undefined ? null : patch.lastErrorMessage,
        patch.activeConnectionId !== undefined,
        patch.lastValidatedAt !== undefined,
      ],
    );
  }

  private emptyState(enabled: boolean, status: GeminiWalletStatus): GeminiWalletState {
    return {
      enabled,
      status: status === 'disabled' ? 'disabled' : 'empty',
      hasKey: false,
      maskedKey: null,
      lastValidatedAt: null,
      lastUsedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      subscriptionFrozen: false,
    };
  }
}

export const geminiWalletService = new GeminiWalletService();
