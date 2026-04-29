export async function integrationJsonRequest(
  url: string,
  init: RequestInit = {},
): Promise<any> {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.detail ||
      payload?.error?.message ||
      payload?.errors?.[0]?.message ||
      (typeof payload === 'string' ? payload : '') ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
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

export function mergeContextInputs(context: { config?: Record<string, any>; inputs?: Record<string, any> }): Record<string, any> {
  return { ...(context.config || {}), ...(context.inputs || {}) };
}
