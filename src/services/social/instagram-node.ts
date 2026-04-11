/**
 * Instagram Node Executor
 *
 * Implements all Instagram Graph API operations via the Meta Graph API v18.0.
 * Routing is driven by params.resource / params.operation — no hardcoded node.type checks.
 */

import { MetaApiError } from './types';
import { getInstagramBusinessAccountId } from '../../shared/instagram-token-manager';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface InstagramNodeParams {
  resource: 'message' | 'media' | 'comment' | 'user' | 'insights' | 'hashtag';
  operation: string;
  instagramBusinessAccountId?: string;
  // message fields
  recipientId?: string;
  text?: string;
  attachmentType?: 'image' | 'audio' | 'video';
  attachmentUrl?: string;
  // media fields
  media_type?: 'IMAGE' | 'VIDEO' | 'REELS' | 'CAROUSEL_ALBUM';
  media_url?: string;
  caption?: string;
  location_id?: string;
  user_tags?: Record<string, any>[];
  product_tags?: Record<string, any>[];
  carouselItems?: string[];
  mediaId?: string;
  // comment fields
  commentId?: string;
  replyText?: string;
  // insights fields
  metric?: string;
  period?: 'day' | 'week' | 'days_28' | 'lifetime';
  since?: string;
  until?: string;
  // hashtag fields
  hashtagName?: string;
  hashtagId?: string;
  // pagination
  limit?: number;
  after?: string;
  returnAll?: boolean;
}

export interface InstagramNodeResult {
  success: boolean;
  resource: string;
  operation: string;
  data: Record<string, any>;
  error: MetaApiError | null;
  meta: { executionTimeMs: number; apiCallCount: number };
}

// ─── InstagramNode class ──────────────────────────────────────────────────────

export class InstagramNode {
  private apiCallCount = 0;
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private readonly accessToken: string,
    private readonly supabase: any,
  ) {}

  // ── Public entry point ────────────────────────────────────────────────────

  async execute(params: InstagramNodeParams): Promise<InstagramNodeResult> {
    const startedAt = Date.now();
    this.apiCallCount = 0;

    try {
      const data = await this.dispatch(params);
      const executionTimeMs = Date.now() - startedAt;
      console.log(
        `[InstagramNode] ${params.resource}.${params.operation} completed in ${executionTimeMs}ms, apiCalls=${this.apiCallCount}`,
      );
      return {
        success: true,
        resource: params.resource,
        operation: params.operation,
        data,
        error: null,
        meta: { executionTimeMs, apiCallCount: this.apiCallCount },
      };
    } catch (error: any) {
      const executionTimeMs = Date.now() - startedAt;
      const metaError = this.parseMetaError(error);
      console.log(
        `[InstagramNode] ${params.resource}.${params.operation} failed in ${executionTimeMs}ms, apiCalls=${this.apiCallCount}`,
      );
      return {
        success: false,
        resource: params.resource,
        operation: params.operation,
        data: {},
        error: metaError,
        meta: { executionTimeMs, apiCallCount: this.apiCallCount },
      };
    }
  }

  // ── Private dispatcher ────────────────────────────────────────────────────

  private async dispatch(params: InstagramNodeParams): Promise<Record<string, any>> {
    switch (params.resource) {
      case 'message':
        return this.handleMessage(params);
      case 'media':
        return this.handleMedia(params);
      case 'comment':
        return this.handleComment(params);
      case 'user':
        return this.handleUser(params);
      case 'insights':
        return this.handleInsights(params);
      case 'hashtag':
        return this.handleHashtag(params);
      default:
        throw new Error(`Unknown resource: ${(params as any).resource}`);
    }
  }

  // ── message resource ──────────────────────────────────────────────────────

  private async handleMessage(params: InstagramNodeParams): Promise<Record<string, any>> {
    const igUserId = await this.resolveIgUserId(params);

    switch (params.operation) {
      case 'sendText': {
        return this.callMetaApi(`/${igUserId}/messages`, 'POST', {
          recipient: { id: params.recipientId },
          message: { text: params.text },
        });
      }

      case 'sendMedia': {
        return this.callMetaApi(`/${igUserId}/messages`, 'POST', {
          recipient: { id: params.recipientId },
          message: {
            attachment: {
              type: params.attachmentType,
              payload: { url: params.attachmentUrl, is_reusable: true },
            },
          },
        });
      }

      case 'sendTemplate': {
        // Instagram DMs can only be sent to users who messaged within 7 days.
        // The Meta API will return error code 10 or 551 if the window is expired.
        // We do NOT make an extra API call to check — we let the API surface the error.
        const templateElements = (params as any).templateElements ?? [];
        try {
          return await this.callMetaApi(`/${igUserId}/messages`, 'POST', {
            recipient: { id: params.recipientId },
            message: {
              attachment: {
                type: 'template',
                payload: {
                  template_type: 'generic',
                  elements: templateElements,
                },
              },
            },
          });
        } catch (error: any) {
          // Error code 10 = permission denied (window expired), 551 = messaging window expired
          if (error?.code === 10 || error?.code === 551) {
            const windowError = new Error(
              'Cannot send message: the 7-day messaging window has expired for this user.',
            );
            (windowError as any).code = error.code;
            (windowError as any).fbtrace_id = error.fbtrace_id;
            throw windowError;
          }
          throw error;
        }
      }

      default:
        throw new Error(`Unknown message operation: ${params.operation}`);
    }
  }

  // ── media resource ────────────────────────────────────────────────────────

  private async handleMedia(params: InstagramNodeParams): Promise<Record<string, any>> {
    const igUserId = await this.resolveIgUserId(params);

    switch (params.operation) {
      case 'createAndPublish': {
        return this.createAndPublishMedia(igUserId, params);
      }

      case 'get': {
        return this.callMetaApi(
          `/${params.mediaId}?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count`,
          'GET',
        );
      }

      default:
        throw new Error(`Unknown media operation: ${params.operation}`);
    }
  }

  private async createAndPublishMedia(
    igUserId: string,
    params: InstagramNodeParams,
  ): Promise<Record<string, any>> {
    const mediaType = params.media_type;

    if (mediaType === 'IMAGE') {
      // Step 1: Create image container
      const containerBody: Record<string, any> = { media_type: 'IMAGE' };
      if (params.media_url !== undefined) containerBody.image_url = params.media_url;
      if (params.caption !== undefined) containerBody.caption = params.caption;
      if (params.location_id !== undefined) containerBody.location_id = params.location_id;
      if (params.user_tags !== undefined) containerBody.user_tags = params.user_tags;
      if (params.product_tags !== undefined) containerBody.product_tags = params.product_tags;

      const container = await this.callMetaApi(`/${igUserId}/media`, 'POST', containerBody);
      const containerId: string = container.id;

      // Step 2: Publish
      const result = await this.callMetaApi(`/${igUserId}/media_publish`, 'POST', {
        creation_id: containerId,
      });

      return { mediaId: result.id, permalink: result.permalink };
    }

    if (mediaType === 'VIDEO' || mediaType === 'REELS') {
      // Step 1: Create video container
      const containerBody: Record<string, any> = { media_type: mediaType };
      if (params.media_url !== undefined) containerBody.video_url = params.media_url;
      if (params.caption !== undefined) containerBody.caption = params.caption;
      if (params.location_id !== undefined) containerBody.location_id = params.location_id;
      if (params.user_tags !== undefined) containerBody.user_tags = params.user_tags;
      if (params.product_tags !== undefined) containerBody.product_tags = params.product_tags;

      const container = await this.callMetaApi(`/${igUserId}/media`, 'POST', containerBody);
      const containerId: string = container.id;

      // Step 2: Poll until FINISHED
      const finalStatus = await this.pollContainerStatus(containerId);

      if (finalStatus === 'ERROR') {
        // Fetch container error message
        const containerInfo = await this.callMetaApi(
          `/${containerId}?fields=status_code,status`,
          'GET',
        );
        const errMsg = containerInfo?.status ?? 'Media container processing failed';
        const err = new Error(errMsg);
        (err as any).code = -1;
        throw err;
      }

      if (finalStatus === 'EXPIRED') {
        const err = new Error('Media container expired');
        (err as any).code = -2;
        throw err;
      }

      if (finalStatus === 'TIMEOUT') {
        const err = new Error('Media container did not finish processing within 50 seconds');
        (err as any).code = -3;
        throw err;
      }

      // Step 3: Publish
      const result = await this.callMetaApi(`/${igUserId}/media_publish`, 'POST', {
        creation_id: containerId,
      });

      return { mediaId: result.id, permalink: result.permalink };
    }

    if (mediaType === 'CAROUSEL_ALBUM') {
      const carouselItems = params.carouselItems ?? [];

      // Step 1: Create item containers (N calls)
      const itemContainerIds: string[] = [];
      for (const url of carouselItems) {
        const itemContainer = await this.callMetaApi(`/${igUserId}/media`, 'POST', {
          image_url: url,
          is_carousel_item: true,
        });
        itemContainerIds.push(itemContainer.id as string);
      }

      // Step 2: Create carousel container (1 call)
      const carouselBody: Record<string, any> = {
        media_type: 'CAROUSEL',
        children: itemContainerIds.join(','),
      };
      if (params.caption !== undefined) carouselBody.caption = params.caption;

      const carouselContainer = await this.callMetaApi(`/${igUserId}/media`, 'POST', carouselBody);
      const carouselContainerId: string = carouselContainer.id;

      // Step 3: Publish (1 call) — total: N + 2
      const result = await this.callMetaApi(`/${igUserId}/media_publish`, 'POST', {
        creation_id: carouselContainerId,
      });

      return { mediaId: result.id, permalink: result.permalink };
    }

    throw new Error(`Unknown media_type: ${mediaType}`);
  }

  // ── comment resource ──────────────────────────────────────────────────────

  private async handleComment(params: InstagramNodeParams): Promise<Record<string, any>> {
    switch (params.operation) {
      case 'list': {
        return this.callMetaApi(
          `/${params.mediaId}/comments?limit=${params.limit ?? 20}`,
          'GET',
        );
      }

      case 'hide': {
        return this.callMetaApi(`/${params.commentId}`, 'POST', { hide: true });
      }

      case 'unhide': {
        return this.callMetaApi(`/${params.commentId}`, 'POST', { hide: false });
      }

      case 'delete': {
        return this.callMetaApi(`/${params.commentId}`, 'DELETE');
      }

      case 'reply': {
        return this.callMetaApi(`/${params.commentId}/replies`, 'POST', {
          message: params.replyText,
        });
      }

      case 'replyDM': {
        const igUserId = await this.resolveIgUserId(params);
        return this.callMetaApi(`/${igUserId}/messages`, 'POST', {
          recipient: { id: params.recipientId },
          message: { text: params.replyText },
        });
      }

      default:
        throw new Error(`Unknown comment operation: ${params.operation}`);
    }
  }

  // ── user resource ─────────────────────────────────────────────────────────

  private async handleUser(params: InstagramNodeParams): Promise<Record<string, any>> {
    const igUserId = await this.resolveIgUserId(params);

    switch (params.operation) {
      case 'get': {
        return this.callMetaApi(
          `/${igUserId}?fields=id,username,biography,followers_count,media_count,profile_picture_url,website`,
          'GET',
        );
      }

      case 'getMedia': {
        return this.callMetaApi(
          `/${igUserId}/media?limit=${params.limit ?? 20}`,
          'GET',
        );
      }

      default:
        throw new Error(`Unknown user operation: ${params.operation}`);
    }
  }

  // ── insights resource ─────────────────────────────────────────────────────

  private async handleInsights(params: InstagramNodeParams): Promise<Record<string, any>> {
    const igUserId = await this.resolveIgUserId(params);

    switch (params.operation) {
      case 'get': {
        const qs = new URLSearchParams();
        if (params.metric !== undefined) qs.set('metric', params.metric);
        if (params.period !== undefined) qs.set('period', params.period);
        if (params.since !== undefined) qs.set('since', params.since);
        if (params.until !== undefined) qs.set('until', params.until);
        const query = qs.toString();
        return this.callMetaApi(
          `/${igUserId}/insights${query ? `?${query}` : ''}`,
          'GET',
        );
      }

      default:
        throw new Error(`Unknown insights operation: ${params.operation}`);
    }
  }

  // ── hashtag resource ──────────────────────────────────────────────────────

  private async handleHashtag(params: InstagramNodeParams): Promise<Record<string, any>> {
    const igUserId = await this.resolveIgUserId(params);

    switch (params.operation) {
      case 'search': {
        return this.callMetaApi(
          `/ig_hashtag_search?user_id=${igUserId}&q=${encodeURIComponent(params.hashtagName ?? '')}`,
          'GET',
        );
      }

      case 'getRecentMedia': {
        return this.callMetaApi(
          `/${params.hashtagId}/recent_media?user_id=${igUserId}&fields=id,caption,media_type,media_url,permalink,timestamp`,
          'GET',
        );
      }

      default:
        throw new Error(`Unknown hashtag operation: ${params.operation}`);
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async callMetaApi(path: string, method: string, body?: object): Promise<any> {
    this.apiCallCount++;

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = (await response.json()) as any;

    if (!response.ok) {
      const err = json?.error ?? {};
      const error = new Error(err.message ?? `HTTP ${response.status}`);
      (error as any).code = err.code;
      (error as any).fbtrace_id = err.fbtrace_id;
      (error as any).errorSubcode = err.error_subcode;
      (error as any).errorData = err.error_data;
      throw error;
    }

    return json;
  }

  private parseMetaError(error: any): MetaApiError {
    const code: number = error?.code ?? 0;
    const message: string = error?.message ?? String(error);
    const fbtrace_id: string | undefined = error?.fbtrace_id;

    let userMessage: string;

    if (code === 190) {
      userMessage = 'Your Facebook/Meta access token has expired. Please reconnect your account.';
    } else if (code === 10 || (code >= 200 && code <= 299)) {
      const scope = error?.errorData?.required_permission ?? 'required permission';
      userMessage = `Missing permission: ${scope}. Please reconnect your account and grant the required permissions.`;
    } else if (code === -1) {
      userMessage = `Media container processing failed: ${message}`;
    } else if (code === -2) {
      userMessage = 'Media container expired before it could be published. Please try again.';
    } else if (code === -3) {
      userMessage = 'Media container did not finish processing within 50 seconds. Please try again.';
    } else {
      userMessage = `Meta API error ${code}: ${message}`;
    }

    return { code, message, fbtrace_id, userMessage };
  }

  private async resolveIgUserId(params: InstagramNodeParams): Promise<string> {
    if (params.instagramBusinessAccountId) {
      return params.instagramBusinessAccountId;
    }
    const id = await getInstagramBusinessAccountId(this.accessToken);
    if (!id) {
      throw new Error(
        'Could not resolve Instagram Business Account ID. Please provide instagramBusinessAccountId or ensure your account is linked to a Facebook Page.',
      );
    }
    return id;
  }

  /**
   * Polls a media container's status_code every 5 seconds.
   * Stops when status is FINISHED, ERROR, or EXPIRED, or after maxPolls polls.
   * Returns the final status string, or 'TIMEOUT' if maxPolls exceeded.
   * Throws with code -3 if maxPolls exceeded (caller should check for TIMEOUT return).
   */
  private async pollContainerStatus(containerId: string, maxPolls = 10): Promise<string> {
    for (let poll = 0; poll < maxPolls; poll++) {
      if (poll > 0) {
        await new Promise<void>((r) => setTimeout(r, 5000));
      }

      const result = await this.callMetaApi(
        `/${containerId}?fields=status_code`,
        'GET',
      );

      const status: string = result?.status_code ?? '';

      if (status === 'FINISHED' || status === 'ERROR' || status === 'EXPIRED') {
        return status;
      }
    }

    // maxPolls exceeded — signal timeout
    const err = new Error('Media container did not finish processing within 50 seconds');
    (err as any).code = -3;
    throw err;
  }
}
