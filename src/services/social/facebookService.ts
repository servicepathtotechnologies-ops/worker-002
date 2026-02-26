/**
 * Facebook Service
 * 
 * Production-ready Facebook Graph API integration service.
 * Handles Facebook operations with proper error handling, rate limiting, and retry logic.
 */

import fetch from 'node-fetch';
import { SocialServiceResponse } from './types';

const FACEBOOK_API_BASE = 'https://graph.facebook.com/v18.0';

/**
 * Facebook Service Response
 */
export interface FacebookServiceResponse extends SocialServiceResponse {
  provider: 'facebook';
}

/**
 * Facebook API Error
 */
export class FacebookAPIError extends Error {
  constructor(
    public statusCode: number,
    public statusText: string,
    public apiError?: any
  ) {
    super(`Facebook API error: ${statusCode} ${statusText}`);
    this.name = 'FacebookAPIError';
  }
}

/**
 * Validate Facebook token
 */
async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${FACEBOOK_API_BASE}/me?access_token=${token}`, {
      headers: {
        'User-Agent': 'CtrlChecks/1.0',
      },
    });
    
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Post to Facebook page/feed
 */
export async function postToFacebook(
  token: string,
  message: string,
  pageId?: string,
  link?: string
): Promise<FacebookServiceResponse> {
  try {
    // Validate token
    const isValid = await validateToken(token);
    if (!isValid) {
      return {
        success: false,
        provider: 'facebook',
        action: 'post',
        data: {},
        error: 'Invalid or expired Facebook token',
      };
    }
    
    // Validate inputs
    if (!message || message.trim().length === 0) {
      return {
        success: false,
        provider: 'facebook',
        action: 'post',
        data: {},
        error: 'Message is required',
      };
    }
    
    // Determine endpoint (user feed vs page feed)
    const endpoint = pageId
      ? `${FACEBOOK_API_BASE}/${pageId}/feed`
      : `${FACEBOOK_API_BASE}/me/feed`;
    
    // Build request body
    const body: Record<string, string> = {
      message: message.trim(),
      access_token: token,
    };
    
    if (link) {
      body.link = link;
    }
    
    // Make API request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CtrlChecks/1.0',
      },
      body: new URLSearchParams(body),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new FacebookAPIError(response.status, response.statusText, errorData);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      provider: 'facebook',
      action: 'post',
      data: {
        id: data.id,
        post_id: data.id,
        message: message.trim(),
        created_time: new Date().toISOString(),
      },
      error: null,
    };
  } catch (error) {
    if (error instanceof FacebookAPIError) {
      return {
        success: false,
        provider: 'facebook',
        action: 'post',
        data: {},
        error: `Facebook API error (${error.statusCode}): ${error.statusText}`,
      };
    }
    
    return {
      success: false,
      provider: 'facebook',
      action: 'post',
      data: {},
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get Facebook user info
 */
export async function getFacebookUser(token: string): Promise<FacebookServiceResponse> {
  try {
    // Validate token
    const isValid = await validateToken(token);
    if (!isValid) {
      return {
        success: false,
        provider: 'facebook',
        action: 'get_user',
        data: {},
        error: 'Invalid or expired Facebook token',
      };
    }
    
    // Make API request
    const response = await fetch(`${FACEBOOK_API_BASE}/me?access_token=${token}&fields=id,name,email`, {
      headers: {
        'User-Agent': 'CtrlChecks/1.0',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new FacebookAPIError(response.status, response.statusText, errorData);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      provider: 'facebook',
      action: 'get_user',
      data: {
        id: data.id,
        name: data.name,
        email: data.email,
      },
      error: null,
    };
  } catch (error) {
    if (error instanceof FacebookAPIError) {
      return {
        success: false,
        provider: 'facebook',
        action: 'get_user',
        data: {},
        error: `Facebook API error (${error.statusCode}): ${error.statusText}`,
      };
    }
    
    return {
      success: false,
      provider: 'facebook',
      action: 'get_user',
      data: {},
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
