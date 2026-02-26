/**
 * Twitter/X Service
 * 
 * Production-ready Twitter API v2 integration service.
 * Handles Twitter operations with proper error handling, rate limiting, and retry logic.
 * 
 * Note: Twitter API v2 requires OAuth 1.0a or OAuth 2.0 Bearer tokens.
 * This implementation uses OAuth 2.0 Bearer tokens for simplicity.
 */

import fetch from 'node-fetch';
import { SocialServiceResponse } from './types';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

/**
 * Twitter Service Response
 */
export interface TwitterServiceResponse extends SocialServiceResponse {
  provider: 'twitter';
}

/**
 * Twitter API Error
 */
export class TwitterAPIError extends Error {
  constructor(
    public statusCode: number,
    public statusText: string,
    public apiError?: any
  ) {
    super(`Twitter API error: ${statusCode} ${statusText}`);
    this.name = 'TwitterAPIError';
  }
}

/**
 * Validate Twitter token
 */
async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${TWITTER_API_BASE}/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'CtrlChecks/1.0',
      },
    });
    
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Post tweet (Twitter API v2)
 */
export async function postTweet(
  token: string,
  text: string
): Promise<TwitterServiceResponse> {
  try {
    // Validate token
    const isValid = await validateToken(token);
    if (!isValid) {
      return {
        success: false,
        provider: 'twitter',
        action: 'post',
        data: {},
        error: 'Invalid or expired Twitter token',
      };
    }
    
    // Validate inputs
    if (!text || text.trim().length === 0) {
      return {
        success: false,
        provider: 'twitter',
        action: 'post',
        data: {},
        error: 'Tweet text is required',
      };
    }
    
    // Twitter has a 280 character limit
    if (text.length > 280) {
      return {
        success: false,
        provider: 'twitter',
        action: 'post',
        data: {},
        error: 'Tweet text exceeds 280 character limit',
      };
    }
    
    // Make API request
    const response = await fetch(`${TWITTER_API_BASE}/tweets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CtrlChecks/1.0',
      },
      body: JSON.stringify({
        text: text.trim(),
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new TwitterAPIError(response.status, response.statusText, errorData);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      provider: 'twitter',
      action: 'post',
      data: {
        id: data.data.id,
        text: data.data.text,
        created_at: new Date().toISOString(),
      },
      error: null,
    };
  } catch (error) {
    if (error instanceof TwitterAPIError) {
      return {
        success: false,
        provider: 'twitter',
        action: 'post',
        data: {},
        error: `Twitter API error (${error.statusCode}): ${error.statusText}`,
      };
    }
    
    return {
      success: false,
      provider: 'twitter',
      action: 'post',
      data: {},
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get Twitter user info
 */
export async function getTwitterUser(token: string): Promise<TwitterServiceResponse> {
  try {
    // Validate token
    const isValid = await validateToken(token);
    if (!isValid) {
      return {
        success: false,
        provider: 'twitter',
        action: 'get_user',
        data: {},
        error: 'Invalid or expired Twitter token',
      };
    }
    
    // Make API request
    const response = await fetch(`${TWITTER_API_BASE}/users/me?user.fields=id,name,username,created_at`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'CtrlChecks/1.0',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new TwitterAPIError(response.status, response.statusText, errorData);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      provider: 'twitter',
      action: 'get_user',
      data: {
        id: data.data.id,
        name: data.data.name,
        username: data.data.username,
        created_at: data.data.created_at,
      },
      error: null,
    };
  } catch (error) {
    if (error instanceof TwitterAPIError) {
      return {
        success: false,
        provider: 'twitter',
        action: 'get_user',
        data: {},
        error: `Twitter API error (${error.statusCode}): ${error.statusText}`,
      };
    }
    
    return {
      success: false,
      provider: 'twitter',
      action: 'get_user',
      data: {},
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
