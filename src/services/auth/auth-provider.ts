// Auth Provider Service
// Checks for existing authentication methods (Google OAuth, etc.)

import { getSupabaseClient } from '../../core/database/supabase-compat';

export interface UserAuthState {
  googleOAuth: {
    available: boolean;
    expiresAt?: Date;
    scopes?: string[];
  };
  environmentVariables: {
    [key: string]: boolean;
  };
}

/**
 * AuthProvider - Manages user authentication state
 * Checks for existing OAuth tokens, environment variables, etc.
 */
export class AuthProvider {
  private supabase: any;
  private userId?: string;

  constructor(userId?: string) {
    this.supabase = getSupabaseClient();
    this.userId = userId;
  }

  /**
   * Get user's authentication state
   */
  async getUserAuthState(): Promise<UserAuthState> {
    const state: UserAuthState = {
      googleOAuth: {
        available: false,
      },
      environmentVariables: {},
    };

    // Check Google OAuth
    if (this.userId) {
      try {
        const { data: tokenData, error } = await this.supabase
          .from('google_oauth_tokens')
          .select('expires_at, scope')
          .eq('user_id', this.userId)
          .single();

        if (!error && tokenData) {
          const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
          const now = new Date();
          const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

          // Token is valid if it exists and is not expired (or expires more than 5 minutes from now)
          if (!expiresAt || expiresAt > fiveMinutesFromNow) {
            state.googleOAuth = {
              available: true,
              expiresAt: expiresAt || undefined,
              scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
            };
          }
        }
      } catch (error) {
        console.warn('[AuthProvider] Error checking Google OAuth:', error);
      }
    }

    // Check environment variables
    state.environmentVariables = {
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_GEMINI_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      SLACK_BOT_TOKEN: !!process.env.SLACK_BOT_TOKEN,
      SLACK_WEBHOOK_URL: !!process.env.SLACK_WEBHOOK_URL,
    };

    return state;
  }

  /**
   * Check if Google OAuth is available for a specific service
   */
  async hasGoogleOAuthForService(service: 'gmail' | 'sheets' | 'drive' | 'calendar'): Promise<boolean> {
    const authState = await this.getUserAuthState();
    
    if (!authState.googleOAuth.available) {
      return false;
    }

    // Check if required scope is present
    const requiredScopes: Record<string, string> = {
      gmail: 'https://www.googleapis.com/auth/gmail.send',
      sheets: 'https://www.googleapis.com/auth/spreadsheets',
      drive: 'https://www.googleapis.com/auth/drive',
      calendar: 'https://www.googleapis.com/auth/calendar',
    };

    const requiredScope = requiredScopes[service];
    if (!requiredScope) return false;

    return authState.googleOAuth.scopes?.some(scope => scope.includes(requiredScope)) || false;
  }
}
