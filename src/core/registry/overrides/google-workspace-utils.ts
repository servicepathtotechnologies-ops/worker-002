import type { NodeExecutionContext } from '../../types/unified-node-contract';
import { getGoogleAccessToken } from '../../../shared/google-sheets';
import { parseGoogleApiError } from '../../../shared/google-api-utils';
import { getAuthoritativeInputs, mergeAuthoritativeInputs } from '../../execution/runtime-input-handoff';
import {
  readAcknowledgedHttpResponse,
  type AcknowledgedHttpResponse,
} from '../../http/acknowledged-response';

export async function getGoogleTokenForContext(
  context: NodeExecutionContext,
  requiredScopes: string[],
): Promise<string> {
  const authoritativeInputs = getAuthoritativeInputs(context);
  const directToken =
    String(authoritativeInputs.accessToken || context.config?.accessToken || '').trim();
  if (directToken) return directToken;

  const userIdsToTry: string[] = [];
  if (context.userId) userIdsToTry.push(context.userId);
  if (context.currentUserId && context.currentUserId !== context.userId) {
    userIdsToTry.push(context.currentUserId);
  }

  const token = userIdsToTry.length > 0
    ? await getGoogleAccessToken(context.db, userIdsToTry, requiredScopes)
    : null;
  if (!token) {
    throw new Error('Google OAuth token not found. Connect a Google account before running this node.');
  }
  return token;
}

export async function googleApiRequest(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<any> {
  const result = await googleApiRequestWithAcknowledgement(url, accessToken, init);
  return result.data;
}

export async function googleApiRequestWithAcknowledgement(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<AcknowledgedHttpResponse> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...((init.headers || {}) as Record<string, string>),
    },
  });

  const parsed = await readAcknowledgedHttpResponse(response, { binaryForNonText: true });
  if (!response.ok) {
    const errorText = parsed.rawText || (typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data || ''));
    throw new Error(parseGoogleApiError(response, errorText));
  }

  return parsed;
}

export function mergedInputs(context: NodeExecutionContext): Record<string, any> {
  return mergeAuthoritativeInputs(context);
}
