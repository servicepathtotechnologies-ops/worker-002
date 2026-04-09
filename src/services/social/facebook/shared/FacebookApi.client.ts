import axios, { AxiosInstance } from 'axios';
import { withRateLimitRetry } from './RateLimiter.helper';

export interface FacebookApiClientConfig {
  accessToken: string;
  apiVersion?: string;
}

export class FacebookApiClient {
  private readonly client: AxiosInstance;
  private readonly accessToken: string;
  private pageTokenCache = new Map<string, string>();
  private apiCallCount = 0;

  constructor(config: FacebookApiClientConfig) {
    this.accessToken = config.accessToken;
    const apiVersion = config.apiVersion || 'v20.0';
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${apiVersion}`,
      timeout: 60_000,
      headers: {
        'User-Agent': 'CtrlChecks-Facebook/1.0',
      },
    });
  }

  getApiCallCount(): number {
    return this.apiCallCount;
  }

  async validateToken(): Promise<void> {
    await this.get('/me', { fields: 'id,name' }, this.accessToken);
  }

  async getPageAccessToken(pageId: string): Promise<string> {
    if (this.pageTokenCache.has(pageId)) {
      return this.pageTokenCache.get(pageId)!;
    }

    const resp = await this.get('/me/accounts', {
      fields: 'id,name,access_token,perms',
      limit: 500,
    });
    const page = (resp.data || []).find((p: any) => p.id === pageId);
    if (!page?.access_token) {
      throw new Error(`No page access token found for page ${pageId}`);
    }
    this.pageTokenCache.set(pageId, page.access_token);
    return page.access_token;
  }

  async get(path: string, params: Record<string, unknown> = {}, token?: string): Promise<any> {
    return withRateLimitRetry(async () => {
      this.apiCallCount += 1;
      const response = await this.client.get(path, {
        params: {
          ...params,
          access_token: token || this.accessToken,
        },
      });
      return response.data;
    });
  }

  async post(path: string, params: Record<string, unknown> = {}, token?: string): Promise<any> {
    return withRateLimitRetry(async () => {
      this.apiCallCount += 1;
      const response = await this.client.post(path, null, {
        params: {
          ...params,
          access_token: token || this.accessToken,
        },
      });
      return response.data;
    });
  }

  async delete(path: string, params: Record<string, unknown> = {}, token?: string): Promise<any> {
    return withRateLimitRetry(async () => {
      this.apiCallCount += 1;
      const response = await this.client.delete(path, {
        params: {
          ...params,
          access_token: token || this.accessToken,
        },
      });
      return response.data;
    });
  }
}
