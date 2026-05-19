/**
 * YouTube node - registry-owned v1 execution.
 *
 * OAuth is resolved from unified_credentials by workflow owner/current test user.
 * Raw accessToken remains a deprecated backend-only fallback for old workflows.
 */

import type { NodeExecutionContext, UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { resolveCredential } from '../../../services/credential-resolver';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.upload',
];

const manualStatic = {
  default: 'manual_static' as const,
  supportsRuntimeAI: false,
  supportsBuildtimeAI: false,
};

const runtimeValue = {
  default: 'manual_static' as const,
  supportsRuntimeAI: true,
  supportsBuildtimeAI: true,
};

const operationOptions = [
  { label: 'List My Channels', value: 'list_my_channels' },
  { label: 'Get Channel', value: 'get_channel' },
  { label: 'Search Videos', value: 'search_videos' },
  { label: 'Get Video Statistics', value: 'get_video_stats' },
  { label: 'Upload Video', value: 'upload_video' },
  { label: 'Update Video Metadata', value: 'update_video_metadata' },
  { label: 'Delete Video', value: 'delete_video' },
];

const operationContracts: UnifiedNodeDefinition['operationContracts'] = [
  {
    operation: 'list_my_channels',
    label: 'List My Channels',
    requiredFields: ['operation'],
    optionalFields: ['maxResults'],
    credentialProviders: ['youtube'],
    outputFields: ['success', 'operation', 'items', 'pageInfo', 'channelId', 'title'],
    legacyAliases: ['list_channels', 'listChannels'],
    status: 'implemented',
  },
  {
    operation: 'get_channel',
    label: 'Get Channel',
    requiredFields: ['operation'],
    optionalFields: ['channelId'],
    credentialProviders: ['youtube'],
    outputFields: ['success', 'operation', 'channel', 'items', 'channelId', 'title'],
    legacyAliases: ['getChannel'],
    status: 'implemented',
  },
  {
    operation: 'search_videos',
    label: 'Search Videos',
    requiredFields: ['operation', 'query'],
    optionalFields: ['channelId', 'maxResults'],
    credentialProviders: ['youtube'],
    outputFields: ['success', 'operation', 'items', 'pageInfo'],
    legacyAliases: ['list_videos', 'searchVideos'],
    status: 'implemented',
  },
  {
    operation: 'get_video_stats',
    label: 'Get Video Statistics',
    requiredFields: ['operation', 'videoId'],
    optionalFields: [],
    credentialProviders: ['youtube'],
    outputFields: ['success', 'operation', 'video', 'statistics', 'videoId', 'title'],
    legacyAliases: ['get_video_statistics', 'getVideoStats'],
    status: 'implemented',
  },
  {
    operation: 'upload_video',
    label: 'Upload Video',
    requiredFields: ['operation', 'title'],
    optionalFields: ['videoUrl', 'videoDataBase64', 'mimeType', 'description', 'tags', 'categoryId', 'privacyStatus', 'madeForKids'],
    credentialProviders: ['youtube'],
    outputFields: ['success', 'operation', 'video', 'videoId', 'title', 'url', 'privacyStatus'],
    legacyAliases: ['uploadVideo', 'post_video', 'create_video'],
    status: 'implemented',
  },
  {
    operation: 'update_video_metadata',
    label: 'Update Video Metadata',
    requiredFields: ['operation', 'videoId'],
    optionalFields: ['title', 'description', 'tags'],
    credentialProviders: ['youtube'],
    outputFields: ['success', 'operation', 'video', 'videoId', 'title'],
    legacyAliases: ['update_video', 'updateVideoMetadata'],
    status: 'implemented',
  },
  {
    operation: 'delete_video',
    label: 'Delete Video',
    requiredFields: ['operation', 'videoId'],
    optionalFields: [],
    credentialProviders: ['youtube'],
    outputFields: ['success', 'operation', 'deleted', 'videoId'],
    legacyAliases: ['deleteVideo'],
    status: 'implemented',
  },
];

function mergedInputs(context: NodeExecutionContext): Record<string, any> {
  return { ...(context.config || {}), ...(context.inputs || {}) };
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeOperation(value: unknown): string {
  const operation = stringValue(value || 'list_my_channels');
  const aliases: Record<string, string> = {
    list_channels: 'list_my_channels',
    listchannels: 'list_my_channels',
    channels: 'list_my_channels',
    list_videos: 'search_videos',
    searchvideos: 'search_videos',
    get_video_statistics: 'get_video_stats',
    getvideostats: 'get_video_stats',
    uploadvideo: 'upload_video',
    post_video: 'upload_video',
    create_video: 'upload_video',
    update_video: 'update_video_metadata',
    updatevideometadata: 'update_video_metadata',
    deletevideo: 'delete_video',
  };
  return aliases[operation] || aliases[operation.toLowerCase()] || operation;
}

function maxResults(value: unknown, fallback = 10): string {
  const parsed = Number(value || fallback);
  const safe = Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.floor(parsed))) : fallback;
  return String(safe);
}

async function getYouTubeAccessToken(context: NodeExecutionContext): Promise<string> {
  const deprecatedRawToken = stringValue(context.inputs?.accessToken || context.config?.accessToken);
  if (deprecatedRawToken) return deprecatedRawToken;

  const userId = context.userId || context.currentUserId;
  if (!userId) {
    throw new Error('YouTube OAuth token not found. Connect YouTube before running this node.');
  }

  const credential = await resolveCredential({
    userId,
    provider: 'youtube',
    requiredScopes: YOUTUBE_SCOPES,
  });

  if (!credential.accessToken) {
    throw new Error('YouTube OAuth token not found. Connect YouTube before running this node.');
  }

  return credential.accessToken;
}

async function youtubeApiRequest(url: string, accessToken: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...((init.headers || {}) as Record<string, string>),
    },
  });

  const text = await response.text();
  const data = text ? safeJson(text) : null;

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error_description ||
      text ||
      `YouTube API request failed with status ${response.status}`;
    throw new Error(`YouTube API error (${response.status}): ${message}`);
  }

  return data;
}

async function youtubeRawRequest(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...((init.headers || {}) as Record<string, string>),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const data = text ? safeJson(text) : null;
    const message =
      data?.error?.message ||
      data?.error_description ||
      text ||
      `YouTube API request failed with status ${response.status}`;
    throw new Error(`YouTube API error (${response.status}): ${message}`);
  }

  return response;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function flattenChannelResponse(operation: string, data: any): Record<string, any> {
  const first = Array.isArray(data?.items) ? data.items[0] : undefined;
  return {
    success: true,
    operation,
    ...data,
    channel: first,
    channelId: first?.id,
    title: first?.snippet?.title,
  };
}

function flattenVideoResponse(operation: string, data: any): Record<string, any> {
  const first = Array.isArray(data?.items) ? data.items[0] : data;
  return {
    success: true,
    operation,
    data,
    video: first,
    videoId: first?.id,
    title: first?.snippet?.title,
    statistics: first?.statistics,
  };
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = stringValue(value).toLowerCase();
  if (!normalized) return fallback;
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
}

function tagsArray(value: unknown): string[] | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const tags = text.split(',').map((tag) => tag.trim()).filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

async function resolveUploadVideoBytes(inputs: Record<string, any>): Promise<{ bytes: Buffer; mimeType: string }> {
  const configuredMimeType = stringValue(inputs.mimeType) || 'video/mp4';
  const videoDataBase64 = stringValue(inputs.videoDataBase64 || inputs.dataBase64 || inputs.base64);
  if (videoDataBase64) {
    const normalized = videoDataBase64.includes(',')
      ? videoDataBase64.slice(videoDataBase64.indexOf(',') + 1)
      : videoDataBase64;
    return { bytes: Buffer.from(normalized, 'base64'), mimeType: configuredMimeType };
  }

  const rawBinary = inputs.videoData || inputs.data || inputs.binaryData;
  if (Buffer.isBuffer(rawBinary)) return { bytes: rawBinary, mimeType: configuredMimeType };
  if (rawBinary instanceof Uint8Array) return { bytes: Buffer.from(rawBinary), mimeType: configuredMimeType };

  const videoUrl = stringValue(inputs.videoUrl || inputs.url);
  if (!videoUrl) {
    throw new Error('videoUrl or videoDataBase64 is required for upload_video');
  }
  if (!/^https?:\/\//i.test(videoUrl)) {
    throw new Error('videoUrl must be an http or https URL');
  }

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download videoUrl (${response.status}): ${await response.text().catch(() => response.statusText)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    bytes: Buffer.from(arrayBuffer),
    mimeType: stringValue(response.headers.get('content-type')) || configuredMimeType,
  };
}

async function uploadVideo(accessToken: string, inputs: Record<string, any>): Promise<Record<string, any>> {
  const title = stringValue(inputs.title);
  if (!title) throw new Error('title is required for upload_video');

  const { bytes, mimeType } = await resolveUploadVideoBytes(inputs);
  if (bytes.length === 0) throw new Error('Video upload data is empty');

  const privacyStatus = stringValue(inputs.privacyStatus) || 'private';
  const metadata = {
    snippet: {
      title,
      description: stringValue(inputs.description),
      ...(tagsArray(inputs.tags) ? { tags: tagsArray(inputs.tags) } : {}),
      ...(stringValue(inputs.categoryId) ? { categoryId: stringValue(inputs.categoryId) } : {}),
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: booleanValue(inputs.madeForKids, false),
    },
  };

  const sessionResponse = await youtubeRawRequest(
    `https://www.googleapis.com/upload/youtube/v3/videos?${new URLSearchParams({
      uploadType: 'resumable',
      part: 'snippet,status',
    }).toString()}`,
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(bytes.length),
        'X-Upload-Content-Type': mimeType,
      },
      body: JSON.stringify(metadata),
    },
  );

  const uploadLocation = sessionResponse.headers.get('location');
  if (!uploadLocation) throw new Error('YouTube did not return an upload session URL');

  const uploadResponse = await youtubeRawRequest(uploadLocation, accessToken, {
    method: 'PUT',
    headers: {
      'Content-Length': String(bytes.length),
      'Content-Type': mimeType,
    },
    body: bytes as any,
  });

  const text = await uploadResponse.text();
  const data = text ? safeJson(text) : {};
  const videoId = stringValue(data?.id);
  return {
    success: true,
    operation: 'upload_video',
    data,
    video: data,
    videoId,
    title: data?.snippet?.title || title,
    privacyStatus: data?.status?.privacyStatus || privacyStatus,
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
  };
}

export function overrideYoutube(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {
  const baseInputSchema = { ...def.inputSchema };
  delete (baseInputSchema as Record<string, unknown>).accessToken;
  delete (baseInputSchema as Record<string, unknown>).credentialId;
  delete (baseInputSchema as Record<string, unknown>).apiKey;
  delete (baseInputSchema as Record<string, unknown>).videoUrl;
  delete (baseInputSchema as Record<string, unknown>).commentText;
  delete (baseInputSchema as Record<string, unknown>).commentId;

  return {
    ...def,
    inputSchema: {
      ...baseInputSchema,
      operation: {
        type: 'string',
        description: 'YouTube operation to perform',
        required: true,
        default: 'list_my_channels',
        role: 'operation_selector',
        ownership: 'structural',
        fillMode: manualStatic,
        ui: { options: operationOptions },
      },
      channelId: {
        type: 'string',
        description: 'YouTube channel ID. Leave empty for the authenticated channel where supported.',
        required: false,
        role: 'id',
        ownership: 'value',
        fillMode: manualStatic,
        ui: { visibleIf: { field: 'operation', equals: ['get_channel', 'search_videos'] } },
      },
      query: {
        type: 'string',
        description: 'Search query for YouTube videos',
        required: false,
        role: 'query',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: {
          visibleIf: { field: 'operation', equals: 'search_videos' },
          requiredIf: { field: 'operation', equals: 'search_videos' },
        },
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of YouTube results to return',
        required: false,
        default: 10,
        role: 'config',
        ownership: 'value',
        fillMode: manualStatic,
        ui: { visibleIf: { field: 'operation', equals: ['list_my_channels', 'search_videos'] } },
      },
      videoId: {
        type: 'string',
        description: 'YouTube video ID',
        required: false,
        role: 'id',
        ownership: 'value',
        fillMode: manualStatic,
        ui: {
          visibleIf: { field: 'operation', equals: ['get_video_stats', 'update_video_metadata', 'delete_video'] },
          requiredIf: { field: 'operation', equals: ['get_video_stats', 'update_video_metadata', 'delete_video'] },
        },
      },
      title: {
        type: 'string',
        description: 'YouTube video title',
        required: false,
        role: 'title_like',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: {
          visibleIf: { field: 'operation', equals: ['upload_video', 'update_video_metadata'] },
          requiredIf: { field: 'operation', equals: 'upload_video' },
        },
      },
      description: {
        type: 'string',
        description: 'YouTube video description',
        required: false,
        role: 'long_body',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: { visibleIf: { field: 'operation', equals: ['upload_video', 'update_video_metadata'] }, widget: 'textarea' },
      },
      tags: {
        type: 'string',
        description: 'Comma-separated YouTube video tags',
        required: false,
        role: 'config',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: { visibleIf: { field: 'operation', equals: ['upload_video', 'update_video_metadata'] } },
      },
      videoUrl: {
        type: 'string',
        description: 'HTTP/HTTPS URL of the video file to upload',
        required: false,
        role: 'id',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: { visibleIf: { field: 'operation', equals: 'upload_video' } },
      },
      videoDataBase64: {
        type: 'string',
        description: 'Base64-encoded video data. Use this when the previous node provides file bytes.',
        required: false,
        role: 'raw_json',
        ownership: 'value',
        fillMode: runtimeValue,
        ui: { visibleIf: { field: 'operation', equals: 'upload_video' }, widget: 'textarea' },
      },
      mimeType: {
        type: 'string',
        description: 'Video MIME type',
        required: false,
        default: 'video/mp4',
        role: 'config',
        ownership: 'value',
        fillMode: manualStatic,
        ui: { visibleIf: { field: 'operation', equals: 'upload_video' } },
      },
      privacyStatus: {
        type: 'string',
        description: 'YouTube privacy status for uploaded video',
        required: false,
        default: 'private',
        role: 'config',
        ownership: 'value',
        fillMode: manualStatic,
        ui: {
          visibleIf: { field: 'operation', equals: 'upload_video' },
          options: [
            { label: 'Private', value: 'private' },
            { label: 'Unlisted', value: 'unlisted' },
            { label: 'Public', value: 'public' },
          ],
        },
      },
      madeForKids: {
        type: 'boolean',
        description: 'Whether the uploaded video is made for kids',
        required: false,
        default: false,
        role: 'config',
        ownership: 'value',
        fillMode: manualStatic,
        ui: { visibleIf: { field: 'operation', equals: 'upload_video' } },
      },
      categoryId: {
        type: 'string',
        description: 'Optional YouTube category ID for uploaded video',
        required: false,
        default: '22',
        role: 'config',
        ownership: 'value',
        fillMode: manualStatic,
        ui: { visibleIf: { field: 'operation', equals: 'upload_video' } },
      },
    },
    requiredInputs: ['operation'],
    credentialSchema: {
      requirements: [
        {
          provider: 'youtube',
          category: 'oauth',
          required: true,
          description: 'YouTube OAuth connection',
          scopes: YOUTUBE_SCOPES,
        },
      ],
      credentialFields: [],
    },
    operationContracts,
    execute: async (context) => {
      const inputs = mergedInputs(context);
      const operation = normalizeOperation(inputs.operation);

      try {
        if (['create_post', 'reply_comment', 'get_comments'].includes(operation)) {
          throw new Error(`YouTube operation "${operation}" is not supported yet. Select a supported YouTube v1 operation.`);
        }

        const accessToken = await getYouTubeAccessToken(context);
        let output: Record<string, any>;

        if (operation === 'list_my_channels') {
          const params = new URLSearchParams({
            part: 'snippet,contentDetails,statistics',
            mine: 'true',
            maxResults: maxResults(inputs.maxResults, 10),
          });
          const data = await youtubeApiRequest(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`, accessToken);
          output = flattenChannelResponse(operation, data);
        } else if (operation === 'get_channel') {
          const channelId = stringValue(inputs.channelId);
          const params = new URLSearchParams({
            part: 'snippet,contentDetails,statistics',
            ...(channelId ? { id: channelId } : { mine: 'true' }),
          });
          const data = await youtubeApiRequest(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`, accessToken);
          output = flattenChannelResponse(operation, data);
        } else if (operation === 'search_videos') {
          const query = stringValue(inputs.query);
          if (!query) throw new Error('query is required for search_videos');
          const params = new URLSearchParams({
            part: 'snippet',
            type: 'video',
            q: query,
            maxResults: maxResults(inputs.maxResults, 10),
          });
          const channelId = stringValue(inputs.channelId);
          if (channelId) params.set('channelId', channelId);
          const data = await youtubeApiRequest(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, accessToken);
          output = { success: true, operation, ...data };
        } else if (operation === 'get_video_stats') {
          const videoId = stringValue(inputs.videoId);
          if (!videoId) throw new Error('videoId is required for get_video_stats');
          const params = new URLSearchParams({
            part: 'snippet,contentDetails,statistics',
            id: videoId,
          });
          const data = await youtubeApiRequest(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`, accessToken);
          output = flattenVideoResponse(operation, data);
        } else if (operation === 'upload_video') {
          output = await uploadVideo(accessToken, inputs);
        } else if (operation === 'update_video_metadata') {
          const videoId = stringValue(inputs.videoId);
          if (!videoId) throw new Error('videoId is required for update_video_metadata');
          if (!stringValue(inputs.title) && !stringValue(inputs.description) && !stringValue(inputs.tags)) {
            throw new Error('At least one of title, description, or tags is required for update_video_metadata');
          }

          const existing = await youtubeApiRequest(
            `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'snippet', id: videoId }).toString()}`,
            accessToken,
          );
          const snippet = existing?.items?.[0]?.snippet;
          if (!snippet) throw new Error(`YouTube video not found: ${videoId}`);

          const updatedSnippet = {
            ...snippet,
            title: stringValue(inputs.title) || snippet.title,
            description: stringValue(inputs.description) || snippet.description || '',
            tags: stringValue(inputs.tags)
              ? stringValue(inputs.tags).split(',').map((tag) => tag.trim()).filter(Boolean)
              : snippet.tags,
          };

          const data = await youtubeApiRequest(
            `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: 'snippet' }).toString()}`,
            accessToken,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: videoId, snippet: updatedSnippet }),
            },
          );
          output = flattenVideoResponse(operation, data);
        } else if (operation === 'delete_video') {
          const videoId = stringValue(inputs.videoId);
          if (!videoId) throw new Error('videoId is required for delete_video');
          await youtubeApiRequest(
            `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ id: videoId }).toString()}`,
            accessToken,
            { method: 'DELETE' },
          );
          output = { success: true, operation, deleted: true, videoId };
        } else {
          throw new Error(`Unsupported YouTube operation: ${operation}`);
        }

        return { success: true, output };
      } catch (error: any) {
        return {
          success: false,
          error: {
            code: 'YOUTUBE_FAILED',
            message: error?.message || 'YouTube operation failed',
          },
        };
      }
    },
  };
}
