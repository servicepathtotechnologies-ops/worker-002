/**
 * Facebook Node - Comprehensive Graph API Integration
 * 
 * Production-ready Facebook Graph API node supporting multiple resources and operations.
 * Similar to n8n's Facebook node with resource/operation pattern.
 * 
 * Resources: User, Page, Post, Photo, Video, Event, Lead, Album
 * Operations: Get, List, Create, Update, Delete (varies by resource)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';

// ============================================================================
// Type Definitions
// ============================================================================

export type FacebookResource = 
  | 'user' 
  | 'page' 
  | 'post' 
  | 'photo' 
  | 'video' 
  | 'event' 
  | 'lead' 
  | 'album';

export type FacebookOperation = 
  | 'get' 
  | 'list' 
  | 'create' 
  | 'update' 
  | 'delete'
  | 'listPosts'
  | 'createPost'
  | 'updatePost'
  | 'deletePost'
  | 'getInsights'
  | 'listComments'
  | 'createComment'
  | 'updateComment'
  | 'deleteComment'
  | 'like'
  | 'upload'
  | 'listPhotos'
  | 'listVideos'
  | 'listEvents'
  | 'listLeads'
  | 'listAlbums';

export interface FacebookNodeParams {
  resource: FacebookResource;
  operation: FacebookOperation;
  // Common parameters
  accessToken?: string; // If provided, overrides token from context
  pageId?: string;
  postId?: string;
  photoId?: string;
  videoId?: string;
  eventId?: string;
  leadId?: string;
  albumId?: string;
  commentId?: string;
  // User operations
  fields?: string; // Comma-separated field list
  // Post operations
  message?: string;
  link?: string;
  place?: string;
  tags?: string; // Comma-separated user IDs
  published?: boolean;
  scheduledPublishTime?: string; // ISO 8601 format
  // Photo operations
  photoUrl?: string; // Public URL or base64
  photoBase64?: string;
  caption?: string;
  // Video operations
  videoUrl?: string;
  videoBase64?: string;
  title?: string;
  description?: string;
  // Event operations
  name?: string;
  startTime?: string; // ISO 8601
  endTime?: string; // ISO 8601
  location?: string;
  // Page operations
  about?: string;
  website?: string;
  // Insights
  metric?: string; // Comma-separated metrics
  period?: 'day' | 'week' | 'days_28' | 'month' | 'lifetime';
  since?: string; // Unix timestamp
  until?: string; // Unix timestamp
  // Lead operations
  formId?: string;
  // Album operations
  albumName?: string;
  // Pagination
  limit?: number; // Max 100
  after?: string; // Cursor for pagination
  // Reaction type
  reactionType?: 'LIKE' | 'LOVE' | 'WOW' | 'HAHA' | 'SORRY' | 'ANGER';
  [key: string]: any; // Allow additional parameters
}

export interface FacebookNodeResult {
  success: boolean;
  resource: FacebookResource;
  operation: FacebookOperation;
  data: any;
  error: {
    message: string;
    statusCode?: number;
    code?: string;
    type?: string;
    errorSubcode?: number;
  } | null;
  pagination?: {
    next?: string;
    previous?: string;
    cursors?: {
      before?: string;
      after?: string;
    };
  };
}

// ============================================================================
// Facebook Node Class
// ============================================================================

export class FacebookNode {
  private accessToken: string;
  private apiVersion: string = 'v18.0';
  private baseUrl: string;
  private axiosInstance: AxiosInstance;
  private pageTokenCache: Map<string, string> = new Map();

  constructor(accessToken: string) {
    if (!accessToken) {
      throw new Error('Facebook access token is required');
    }
    this.accessToken = accessToken;
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
    
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 60 seconds for file uploads
      headers: {
        'User-Agent': 'CtrlChecks/1.0',
      },
    });
  }

  /**
   * Main execution method
   */
  async execute(params: FacebookNodeParams): Promise<FacebookNodeResult> {
    const { resource, operation } = params;

    try {
      // Validate required parameters
      this.validateParams(params);

      // Route to appropriate resource handler
      let result: any;
      
      switch (resource) {
        case 'user':
          result = await this.handleUserOperations(operation, params);
          break;
        case 'page':
          result = await this.handlePageOperations(operation, params);
          break;
        case 'post':
          result = await this.handlePostOperations(operation, params);
          break;
        case 'photo':
          result = await this.handlePhotoOperations(operation, params);
          break;
        case 'video':
          result = await this.handleVideoOperations(operation, params);
          break;
        case 'event':
          result = await this.handleEventOperations(operation, params);
          break;
        case 'lead':
          result = await this.handleLeadOperations(operation, params);
          break;
        case 'album':
          result = await this.handleAlbumOperations(operation, params);
          break;
        default:
          throw new Error(`Unsupported resource: ${resource}`);
      }

      return {
        success: true,
        resource,
        operation,
        data: result.data || result,
        error: null,
        pagination: result.paging || result.pagination,
      };
    } catch (error: any) {
      return this.handleError(error, resource, operation);
    }
  }

  // ========================================================================
  // Token Management
  // ========================================================================

  /**
   * Get page access token from user token
   * Caches tokens in memory during node execution
   */
  private async getPageAccessToken(pageId: string): Promise<string> {
    // Check cache first
    if (this.pageTokenCache.has(pageId)) {
      return this.pageTokenCache.get(pageId)!;
    }

    try {
      const response = await this.axiosInstance.get('/me/accounts', {
        params: {
          access_token: this.accessToken,
          fields: 'id,name,access_token',
        },
      });

      const pages = response.data.data || [];
      const page = pages.find((p: any) => p.id === pageId);

      if (!page) {
        throw new Error(`Page ${pageId} not found or user doesn't have access`);
      }

      if (!page.access_token) {
        throw new Error(`No access token available for page ${pageId}`);
      }

      // Cache the token
      this.pageTokenCache.set(pageId, page.access_token);
      return page.access_token;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const fbError = this.extractFacebookError(error);
        throw new Error(`Failed to get page access token: ${fbError.message}`);
      }
      throw error;
    }
  }

  /**
   * Get appropriate token for operation
   * If pageId is provided and operation requires page token, fetch it
   */
  private async getTokenForOperation(params: FacebookNodeParams): Promise<string> {
    // If accessToken is explicitly provided, use it
    if (params.accessToken) {
      return params.accessToken;
    }

    // For page operations, try to get page token
    if (params.pageId && this.requiresPageToken(params.resource, params.operation)) {
      try {
        return await this.getPageAccessToken(params.pageId);
      } catch (error) {
        // If page token fetch fails, fall back to user token
        // Facebook will return an error if token is insufficient
        console.warn('Failed to get page token, using user token:', error);
        return this.accessToken;
      }
    }

    return this.accessToken;
  }

  /**
   * Check if operation requires page access token
   */
  private requiresPageToken(resource: FacebookResource, operation: FacebookOperation): boolean {
    const pageOperations = [
      'createPost', 'updatePost', 'deletePost', 'getInsights',
      'upload', 'create', 'update', 'delete',
    ];
    
    return resource === 'page' || 
           (resource === 'photo' && pageOperations.includes(operation)) ||
           (resource === 'video' && pageOperations.includes(operation)) ||
           (resource === 'event' && pageOperations.includes(operation)) ||
           (resource === 'album' && pageOperations.includes(operation));
  }

  // ========================================================================
  // User Operations
  // ========================================================================

  private async handleUserOperations(
    operation: FacebookOperation,
    params: FacebookNodeParams
  ): Promise<any> {
    switch (operation) {
      case 'get': {
        const token = await this.getTokenForOperation(params);
        return await this.getUser(token, params.fields);
      }
      
      case 'listPosts':
      case 'list':
        return await this.listUserPosts(params);
      
      case 'createPost':
      case 'create':
        return await this.createUserPost(params);
      
      default:
        throw new Error(`Unsupported user operation: ${operation}`);
    }
  }

  private async getUser(token: string, fields?: string): Promise<any> {
    const defaultFields = 'id,name,email,picture';
    const response = await this.axiosInstance.get('/me', {
      params: {
        access_token: token,
        fields: fields || defaultFields,
      },
    });
    return response.data;
  }

  private async listUserPosts(params: FacebookNodeParams): Promise<any> {
    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.get('/me/posts', {
      params: {
        access_token: token,
        fields: 'id,message,created_time,updated_time,likes.summary(true),comments.summary(true)',
        limit: params.limit || 25,
        after: params.after,
      },
    });
    return response.data;
  }

  private async createUserPost(params: FacebookNodeParams): Promise<any> {
    const token = await this.getTokenForOperation(params);
    
    if (!params.message && !params.link) {
      throw new Error('Either message or link is required');
    }

    const body: any = {
      access_token: token,
    };

    if (params.message) body.message = params.message;
    if (params.link) body.link = params.link;
    if (params.place) body.place = params.place;
    if (params.tags) body.tags = params.tags;

    const response = await this.axiosInstance.post('/me/feed', null, {
      params: body,
    });
    return response.data;
  }

  // ========================================================================
  // Page Operations
  // ========================================================================

  private async handlePageOperations(
    operation: FacebookOperation,
    params: FacebookNodeParams
  ): Promise<any> {
    switch (operation) {
      case 'get':
        return await this.getPage(params);
      
      case 'list':
        return await this.listPages(params);
      
      case 'update':
        return await this.updatePage(params);
      
      case 'listPosts':
        return await this.listPagePosts(params);
      
      case 'createPost':
      case 'create':
        return await this.createPagePost(params);
      
      case 'updatePost':
        return await this.updatePagePost(params);
      
      case 'deletePost':
        return await this.deletePagePost(params);
      
      case 'getInsights':
        return await this.getPageInsights(params);
      
      default:
        throw new Error(`Unsupported page operation: ${operation}`);
    }
  }

  private async getPage(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for get page operation');
    }

    const token = await this.getTokenForOperation(params);
    const fields = params.fields || 'id,name,about,website,fan_count,link,picture';
    
    const response = await this.axiosInstance.get(`/${params.pageId}`, {
      params: {
        access_token: token,
        fields,
      },
    });
    return response.data;
  }

  private async listPages(params: FacebookNodeParams): Promise<any> {
    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.get('/me/accounts', {
      params: {
        access_token: token,
        fields: 'id,name,access_token,category,fan_count',
        limit: params.limit || 25,
        after: params.after,
      },
    });
    return response.data;
  }

  private async updatePage(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for update page operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
    };

    if (params.about) body.about = params.about;
    if (params.website) body.website = params.website;
    if (params.description) body.description = params.description;

    const response = await this.axiosInstance.post(`/${params.pageId}`, null, {
      params: body,
    });
    return response.data;
  }

  private async listPagePosts(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for list page posts operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.get(`/${params.pageId}/posts`, {
      params: {
        access_token: token,
        fields: 'id,message,created_time,updated_time,likes.summary(true),comments.summary(true),shares',
        limit: params.limit || 25,
        after: params.after,
      },
    });
    return response.data;
  }

  private async createPagePost(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for create page post operation');
    }

    if (!params.message && !params.link) {
      throw new Error('Either message or link is required');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
    };

    if (params.message) body.message = params.message;
    if (params.link) body.link = params.link;
    if (params.published !== undefined) body.published = params.published;
    if (params.scheduledPublishTime) body.scheduled_publish_time = params.scheduledPublishTime;

    const response = await this.axiosInstance.post(`/${params.pageId}/feed`, null, {
      params: body,
    });
    return response.data;
  }

  private async updatePagePost(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId || !params.postId) {
      throw new Error('pageId and postId are required for update page post operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
    };

    if (params.message) body.message = params.message;

    const response = await this.axiosInstance.post(`/${params.postId}`, null, {
      params: body,
    });
    return response.data;
  }

  private async deletePagePost(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId || !params.postId) {
      throw new Error('pageId and postId are required for delete page post operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.delete(`/${params.postId}`, {
      params: {
        access_token: token,
      },
    });
    return response.data;
  }

  private async getPageInsights(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for get page insights operation');
    }

    if (!params.metric) {
      throw new Error('metric is required for get page insights operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
      metric: params.metric,
    };

    if (params.period) body.period = params.period;
    if (params.since) body.since = params.since;
    if (params.until) body.until = params.until;

    const response = await this.axiosInstance.get(`/${params.pageId}/insights`, {
      params: body,
    });
    return response.data;
  }

  // ========================================================================
  // Post Operations
  // ========================================================================

  private async handlePostOperations(
    operation: FacebookOperation,
    params: FacebookNodeParams
  ): Promise<any> {
    switch (operation) {
      case 'get':
        return await this.getPost(params);
      
      case 'listComments':
        return await this.listPostComments(params);
      
      case 'createComment':
        return await this.createPostComment(params);
      
      case 'updateComment':
        return await this.updatePostComment(params);
      
      case 'deleteComment':
        return await this.deletePostComment(params);
      
      case 'like':
        return await this.likePost(params);
      
      default:
        throw new Error(`Unsupported post operation: ${operation}`);
    }
  }

  private async getPost(params: FacebookNodeParams): Promise<any> {
    if (!params.postId) {
      throw new Error('postId is required for get post operation');
    }

    const token = await this.getTokenForOperation(params);
    const fields = params.fields || 'id,message,created_time,updated_time,likes,comments,shares';
    
    const response = await this.axiosInstance.get(`/${params.postId}`, {
      params: {
        access_token: token,
        fields,
      },
    });
    return response.data;
  }

  private async listPostComments(params: FacebookNodeParams): Promise<any> {
    if (!params.postId) {
      throw new Error('postId is required for list post comments operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.get(`/${params.postId}/comments`, {
      params: {
        access_token: token,
        fields: 'id,message,created_time,from,like_count',
        limit: params.limit || 25,
        after: params.after,
      },
    });
    return response.data;
  }

  private async createPostComment(params: FacebookNodeParams): Promise<any> {
    if (!params.postId) {
      throw new Error('postId is required for create post comment operation');
    }

    if (!params.message) {
      throw new Error('message is required for create post comment operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.post(`/${params.postId}/comments`, null, {
      params: {
        access_token: token,
        message: params.message,
      },
    });
    return response.data;
  }

  private async updatePostComment(params: FacebookNodeParams): Promise<any> {
    if (!params.commentId) {
      throw new Error('commentId is required for update post comment operation');
    }

    if (!params.message) {
      throw new Error('message is required for update post comment operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.post(`/${params.commentId}`, null, {
      params: {
        access_token: token,
        message: params.message,
      },
    });
    return response.data;
  }

  private async deletePostComment(params: FacebookNodeParams): Promise<any> {
    if (!params.commentId) {
      throw new Error('commentId is required for delete post comment operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.delete(`/${params.commentId}`, {
      params: {
        access_token: token,
      },
    });
    return response.data;
  }

  private async likePost(params: FacebookNodeParams): Promise<any> {
    if (!params.postId) {
      throw new Error('postId is required for like post operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.post(`/${params.postId}/likes`, null, {
      params: {
        access_token: token,
      },
    });
    return response.data;
  }

  // ========================================================================
  // Photo Operations
  // ========================================================================

  private async handlePhotoOperations(
    operation: FacebookOperation,
    params: FacebookNodeParams
  ): Promise<any> {
    switch (operation) {
      case 'list':
      case 'listPhotos':
        return await this.listPhotos(params);
      
      case 'upload':
      case 'create':
        return await this.uploadPhoto(params);
      
      case 'update':
        return await this.updatePhoto(params);
      
      case 'delete':
        return await this.deletePhoto(params);
      
      default:
        throw new Error(`Unsupported photo operation: ${operation}`);
    }
  }

  private async listPhotos(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for list photos operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.get(`/${params.pageId}/photos`, {
      params: {
        access_token: token,
        fields: 'id,name,created_time,picture,images',
        limit: params.limit || 25,
        after: params.after,
      },
    });
    return response.data;
  }

  private async uploadPhoto(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for upload photo operation');
    }

    const token = await this.getTokenForOperation(params);
    
    // Get photo data (from URL or base64)
    let photoBuffer: Buffer;
    if (params.photoBase64) {
      // Remove data URL prefix if present
      const base64Data = params.photoBase64.replace(/^data:image\/\w+;base64,/, '');
      photoBuffer = Buffer.from(base64Data, 'base64');
    } else if (params.photoUrl) {
      // Download photo from URL
      const photoResponse = await axios.get(params.photoUrl, {
        responseType: 'arraybuffer',
      });
      photoBuffer = Buffer.from(photoResponse.data);
    } else {
      throw new Error('Either photoUrl or photoBase64 is required');
    }

    // Create form data
    const formData = new FormData();
    formData.append('source', photoBuffer, {
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
    });
    formData.append('access_token', token);
    if (params.caption) formData.append('message', params.caption);
    if (params.published !== undefined) formData.append('published', params.published.toString());
    if (params.scheduledPublishTime) formData.append('scheduled_publish_time', params.scheduledPublishTime);

    const response = await this.axiosInstance.post(`/${params.pageId}/photos`, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return response.data;
  }

  private async updatePhoto(params: FacebookNodeParams): Promise<any> {
    if (!params.photoId) {
      throw new Error('photoId is required for update photo operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
    };

    if (params.caption) body.message = params.caption;
    if (params.name) body.name = params.name;

    const response = await this.axiosInstance.post(`/${params.photoId}`, null, {
      params: body,
    });
    return response.data;
  }

  private async deletePhoto(params: FacebookNodeParams): Promise<any> {
    if (!params.photoId) {
      throw new Error('photoId is required for delete photo operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.delete(`/${params.photoId}`, {
      params: {
        access_token: token,
      },
    });
    return response.data;
  }

  // ========================================================================
  // Video Operations
  // ========================================================================

  private async handleVideoOperations(
    operation: FacebookOperation,
    params: FacebookNodeParams
  ): Promise<any> {
    switch (operation) {
      case 'list':
      case 'listVideos':
        return await this.listVideos(params);
      
      case 'upload':
      case 'create':
        return await this.uploadVideo(params);
      
      case 'update':
        return await this.updateVideo(params);
      
      case 'delete':
        return await this.deleteVideo(params);
      
      default:
        throw new Error(`Unsupported video operation: ${operation}`);
    }
  }

  private async listVideos(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for list videos operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.get(`/${params.pageId}/videos`, {
      params: {
        access_token: token,
        fields: 'id,title,description,created_time,length,source,picture',
        limit: params.limit || 25,
        after: params.after,
      },
    });
    return response.data;
  }

  private async uploadVideo(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for upload video operation');
    }

    const token = await this.getTokenForOperation(params);
    
    // Get video data (from URL or base64)
    let videoBuffer: Buffer;
    if (params.videoBase64) {
      const base64Data = params.videoBase64.replace(/^data:video\/\w+;base64,/, '');
      videoBuffer = Buffer.from(base64Data, 'base64');
    } else if (params.videoUrl) {
      const videoResponse = await axios.get(params.videoUrl, {
        responseType: 'arraybuffer',
      });
      videoBuffer = Buffer.from(videoResponse.data);
    } else {
      throw new Error('Either videoUrl or videoBase64 is required');
    }

    // Create form data
    const formData = new FormData();
    formData.append('source', videoBuffer, {
      filename: 'video.mp4',
      contentType: 'video/mp4',
    });
    formData.append('access_token', token);
    if (params.title) formData.append('title', params.title);
    if (params.description) formData.append('description', params.description);
    if (params.published !== undefined) formData.append('published', params.published.toString());
    if (params.scheduledPublishTime) formData.append('scheduled_publish_time', params.scheduledPublishTime);

    const response = await this.axiosInstance.post(`/${params.pageId}/videos`, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000, // 5 minutes for video uploads
    });
    return response.data;
  }

  private async updateVideo(params: FacebookNodeParams): Promise<any> {
    if (!params.videoId) {
      throw new Error('videoId is required for update video operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
    };

    if (params.title) body.title = params.title;
    if (params.description) body.description = params.description;

    const response = await this.axiosInstance.post(`/${params.videoId}`, null, {
      params: body,
    });
    return response.data;
  }

  private async deleteVideo(params: FacebookNodeParams): Promise<any> {
    if (!params.videoId) {
      throw new Error('videoId is required for delete video operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.delete(`/${params.videoId}`, {
      params: {
        access_token: token,
      },
    });
    return response.data;
  }

  // ========================================================================
  // Event Operations
  // ========================================================================

  private async handleEventOperations(
    operation: FacebookOperation,
    params: FacebookNodeParams
  ): Promise<any> {
    switch (operation) {
      case 'list':
      case 'listEvents':
        return await this.listEvents(params);
      
      case 'create':
        return await this.createEvent(params);
      
      case 'get':
        return await this.getEvent(params);
      
      case 'update':
        return await this.updateEvent(params);
      
      case 'delete':
        return await this.deleteEvent(params);
      
      default:
        throw new Error(`Unsupported event operation: ${operation}`);
    }
  }

  private async listEvents(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for list events operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.get(`/${params.pageId}/events`, {
      params: {
        access_token: token,
        fields: 'id,name,start_time,end_time,description,place,attending_count,interested_count',
        limit: params.limit || 25,
        after: params.after,
      },
    });
    return response.data;
  }

  private async createEvent(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for create event operation');
    }

    if (!params.name) {
      throw new Error('name is required for create event operation');
    }

    if (!params.startTime) {
      throw new Error('startTime is required for create event operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
      name: params.name,
      start_time: params.startTime,
    };

    if (params.endTime) body.end_time = params.endTime;
    if (params.description) body.description = params.description;
    if (params.location) body.location = params.location;

    const response = await this.axiosInstance.post(`/${params.pageId}/events`, null, {
      params: body,
    });
    return response.data;
  }

  private async getEvent(params: FacebookNodeParams): Promise<any> {
    if (!params.eventId) {
      throw new Error('eventId is required for get event operation');
    }

    const token = await this.getTokenForOperation(params);
    const fields = params.fields || 'id,name,start_time,end_time,description,place,attending_count,interested_count';
    
    const response = await this.axiosInstance.get(`/${params.eventId}`, {
      params: {
        access_token: token,
        fields,
      },
    });
    return response.data;
  }

  private async updateEvent(params: FacebookNodeParams): Promise<any> {
    if (!params.eventId) {
      throw new Error('eventId is required for update event operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
    };

    if (params.name) body.name = params.name;
    if (params.startTime) body.start_time = params.startTime;
    if (params.endTime) body.end_time = params.endTime;
    if (params.description) body.description = params.description;
    if (params.location) body.location = params.location;

    const response = await this.axiosInstance.post(`/${params.eventId}`, null, {
      params: body,
    });
    return response.data;
  }

  private async deleteEvent(params: FacebookNodeParams): Promise<any> {
    if (!params.eventId) {
      throw new Error('eventId is required for delete event operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.delete(`/${params.eventId}`, {
      params: {
        access_token: token,
      },
    });
    return response.data;
  }

  // ========================================================================
  // Lead Operations
  // ========================================================================

  private async handleLeadOperations(
    operation: FacebookOperation,
    params: FacebookNodeParams
  ): Promise<any> {
    switch (operation) {
      case 'list':
      case 'listLeads':
        return await this.listLeads(params);
      
      case 'get':
        return await this.getLead(params);
      
      default:
        throw new Error(`Unsupported lead operation: ${operation}`);
    }
  }

  private async listLeads(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for list leads operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
      limit: params.limit || 25,
      after: params.after,
    };

    if (params.formId) {
      // Get leads for specific form
      const response = await this.axiosInstance.get(`/${params.formId}/leads`, {
        params: body,
      });
      return response.data;
    } else {
      // Get all leads for page
      const response = await this.axiosInstance.get(`/${params.pageId}/leads`, {
        params: body,
      });
      return response.data;
    }
  }

  private async getLead(params: FacebookNodeParams): Promise<any> {
    if (!params.leadId) {
      throw new Error('leadId is required for get lead operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.get(`/${params.leadId}`, {
      params: {
        access_token: token,
        fields: 'id,created_time,field_data',
      },
    });
    return response.data;
  }

  // ========================================================================
  // Album Operations
  // ========================================================================

  private async handleAlbumOperations(
    operation: FacebookOperation,
    params: FacebookNodeParams
  ): Promise<any> {
    switch (operation) {
      case 'list':
        return await this.listAlbums(params);
      
      case 'create':
        return await this.createAlbum(params);
      
      case 'get':
        return await this.getAlbum(params);
      
      case 'update':
        return await this.updateAlbum(params);
      
      case 'delete':
        return await this.deleteAlbum(params);
      
      default:
        throw new Error(`Unsupported album operation: ${operation}`);
    }
  }

  private async listAlbums(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for list albums operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.get(`/${params.pageId}/albums`, {
      params: {
        access_token: token,
        fields: 'id,name,description,created_time,count,cover_photo',
        limit: params.limit || 25,
        after: params.after,
      },
    });
    return response.data;
  }

  private async createAlbum(params: FacebookNodeParams): Promise<any> {
    if (!params.pageId) {
      throw new Error('pageId is required for create album operation');
    }

    if (!params.albumName) {
      throw new Error('albumName is required for create album operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
      name: params.albumName,
    };

    if (params.description) body.description = params.description;
    if (params.location) body.location = params.location;

    const response = await this.axiosInstance.post(`/${params.pageId}/albums`, null, {
      params: body,
    });
    return response.data;
  }

  private async getAlbum(params: FacebookNodeParams): Promise<any> {
    if (!params.albumId) {
      throw new Error('albumId is required for get album operation');
    }

    const token = await this.getTokenForOperation(params);
    const fields = params.fields || 'id,name,description,created_time,count,cover_photo';
    
    const response = await this.axiosInstance.get(`/${params.albumId}`, {
      params: {
        access_token: token,
        fields,
      },
    });
    return response.data;
  }

  private async updateAlbum(params: FacebookNodeParams): Promise<any> {
    if (!params.albumId) {
      throw new Error('albumId is required for update album operation');
    }

    const token = await this.getTokenForOperation(params);
    const body: any = {
      access_token: token,
    };

    if (params.albumName) body.name = params.albumName;
    if (params.description) body.description = params.description;
    if (params.location) body.location = params.location;

    const response = await this.axiosInstance.post(`/${params.albumId}`, null, {
      params: body,
    });
    return response.data;
  }

  private async deleteAlbum(params: FacebookNodeParams): Promise<any> {
    if (!params.albumId) {
      throw new Error('albumId is required for delete album operation');
    }

    const token = await this.getTokenForOperation(params);
    const response = await this.axiosInstance.delete(`/${params.albumId}`, {
      params: {
        access_token: token,
      },
    });
    return response.data;
  }

  // ========================================================================
  // Validation & Error Handling
  // ========================================================================

  private validateParams(params: FacebookNodeParams): void {
    if (!params.resource) {
      throw new Error('Resource is required');
    }
    if (!params.operation) {
      throw new Error('Operation is required');
    }
  }

  private extractFacebookError(error: AxiosError): { message: string; code?: string; statusCode?: number } {
    if (error.response?.data) {
      const fbError = error.response.data as any;
      return {
        message: fbError.error?.message || error.message,
        code: fbError.error?.code?.toString(),
        statusCode: error.response.status,
      };
    }
    return {
      message: error.message,
      statusCode: error.response?.status,
    };
  }

  private handleError(
    error: any,
    resource: FacebookResource,
    operation: FacebookOperation
  ): FacebookNodeResult {
    if (axios.isAxiosError(error)) {
      const fbError = this.extractFacebookError(error);
      return {
        success: false,
        resource,
        operation,
        data: {},
        error: {
          message: fbError.message,
          statusCode: fbError.statusCode,
          code: fbError.code,
        },
      };
    }

    return {
      success: false,
      resource,
      operation,
      data: {},
      error: {
        message: error.message || 'Unknown error occurred',
      },
    };
  }
}
