import { extractProviderErrorMessage, readAcknowledgedHttpResponse } from '../../http/acknowledged-response';
import { mergeAuthoritativeInputs } from '../../execution/runtime-input-handoff';

export async function integrationJsonRequest(
  url: string,
  init: RequestInit = {},
): Promise<any> {
  const response = await fetch(url, init);
  const parsed = await readAcknowledgedHttpResponse(response);
  if (!response.ok) {
    throw new Error(extractProviderErrorMessage(parsed));
  }
  return parsed.data;
}

export function authHeaderFromToken(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function basicAuthHeader(username: string, password: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  };
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function mergeContextInputs(context: {
  config?: Record<string, any>;
  inputs?: Record<string, any>;
  finalResolvedInputs?: Record<string, any>;
}): Record<string, any> {
  return mergeAuthoritativeInputs(context);
}
