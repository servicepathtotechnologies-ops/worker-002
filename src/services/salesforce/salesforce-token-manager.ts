import { getSupabaseClient } from '../../core/database/supabase-compat';

export interface SalesforceToken {
  userId: string;
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  issuedAt: Date;
  expiresAt: Date;
  scope: string;
}

class SalesforceTokenManager {
  /**
   * Returns a valid (non-expired) Salesforce token for the given userId.
   * Auto-refreshes if within 5 minutes of expiry.
   * Returns null if no token exists or refresh fails.
   */
  async getToken(userId: string): Promise<SalesforceToken | null> {
    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('salesforce_oauth_tokens')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('[SalesforceTokenManager] Error querying token:', { userId, error: error.message });
        return null;
      }

      if (!data) {
        return null;
      }

      const currentToken = this.mapDbRowToToken(data);

      // Refresh if within 5 minutes of expiry
      const fiveMinutesMs = 5 * 60 * 1000;
      const timeUntilExpiry = currentToken.expiresAt.getTime() - Date.now();

      if (timeUntilExpiry < fiveMinutesMs) {
        const refreshed = await this.refreshToken(userId, currentToken);
        if (!refreshed) {
          console.error('[SalesforceTokenManager] Token refresh failed', { userId });
          return null;
        }
        return refreshed;
      }

      return currentToken;
    } catch (err) {
      console.error('[SalesforceTokenManager] Unexpected error in getToken:', { userId, err });
      return null;
    }
  }

  /**
   * Exchanges the refresh token for a new access token via Salesforce OAuth endpoint.
   * Persists the updated token to DB on success.
   * Returns null on failure.
   */
  async refreshToken(userId: string, currentToken: SalesforceToken): Promise<SalesforceToken | null> {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.SALESFORCE_CLIENT_ID ?? '',
        client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? '',
        refresh_token: currentToken.refreshToken,
      });

      const response = await fetch(`${currentToken.instanceUrl}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        console.error('[SalesforceTokenManager] Token refresh HTTP error', {
          userId,
          status: response.status,
        });
        return null;
      }

      const json = await response.json() as {
        access_token: string;
        issued_at: string;
        instance_url: string;
        scope: string;
      };

      // Salesforce issued_at is a Unix timestamp in milliseconds
      const issuedAt = new Date(parseInt(json.issued_at, 10));
      const expiresAt = new Date(issuedAt.getTime() + 2 * 60 * 60 * 1000); // 2 hours default

      const updatedToken: SalesforceToken = {
        userId,
        accessToken: json.access_token,
        refreshToken: currentToken.refreshToken,
        instanceUrl: json.instance_url ?? currentToken.instanceUrl,
        issuedAt,
        expiresAt,
        scope: json.scope ?? currentToken.scope,
      };

      await this.upsertToken(userId, {
        accessToken: updatedToken.accessToken,
        refreshToken: updatedToken.refreshToken,
        instanceUrl: updatedToken.instanceUrl,
        issuedAt: updatedToken.issuedAt,
        expiresAt: updatedToken.expiresAt,
        scope: updatedToken.scope,
      });

      return updatedToken;
    } catch (err) {
      console.error('[SalesforceTokenManager] Unexpected error in refreshToken:', { userId, err });
      return null;
    }
  }

  /**
   * Inserts or updates the token record for a given userId (ON CONFLICT user_id DO UPDATE).
   */
  async upsertToken(userId: string, tokenData: Omit<SalesforceToken, 'userId'>): Promise<void> {
    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('salesforce_oauth_tokens')
        .upsert(
          {
            user_id: userId,
            access_token: tokenData.accessToken,
            refresh_token: tokenData.refreshToken,
            instance_url: tokenData.instanceUrl,
            issued_at: tokenData.issuedAt.toISOString(),
            expires_at: tokenData.expiresAt.toISOString(),
            scope: tokenData.scope,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('[SalesforceTokenManager] Error upserting token:', { userId, error: error.message });
      }
    } catch (err) {
      console.error('[SalesforceTokenManager] Unexpected error in upsertToken:', { userId, err });
    }
  }

  private mapDbRowToToken(row: Record<string, unknown>): SalesforceToken {
    return {
      userId: row.user_id as string,
      accessToken: row.access_token as string,
      refreshToken: row.refresh_token as string,
      instanceUrl: row.instance_url as string,
      issuedAt: new Date(row.issued_at as string),
      expiresAt: new Date(row.expires_at as string),
      scope: (row.scope as string) ?? '',
    };
  }
}

export const salesforceTokenManager = new SalesforceTokenManager();
