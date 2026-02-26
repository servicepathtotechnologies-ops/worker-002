/**
 * Social Service Types
 * 
 * Common types and interfaces for social media service layer.
 */

export type SocialProvider = 'github' | 'facebook' | 'twitter' | 'linkedin' | 'google';

export interface SocialServiceResponse {
  success: boolean;
  provider: SocialProvider;
  action: string;
  data: Record<string, any>;
  error: string | null;
}

export interface SocialServiceConfig {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}
