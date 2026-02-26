/**
 * Type declarations for clickupNode.js
 */

export interface ClickUpCredentials {
  apiToken: string;
  teamId?: string;
  baseUrl?: string;
}

export interface ClickUpOperation {
  name: string;
  params?: Record<string, any>;
}

export interface ClickUpResult {
  success: boolean;
  data?: any;
  error?: string;
}

export declare function run(
  credentials: ClickUpCredentials,
  operation: ClickUpOperation
): Promise<ClickUpResult>;
