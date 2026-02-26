// Zoho API Client
// Comprehensive client for all Zoho services (CRM, Books, Creator, Sheets, Tasks, Billing, Email, Tables)
// Supports all regions and automatic token refresh

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import { ZohoRegion, getZohoApiBaseUrl, getZohoTokenEndpoint } from './zoho-oauth';

export interface ZohoApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    statusCode?: number;
    code?: string;
    details?: any;
  };
}

export interface ZohoPaginationParams {
  page?: number;
  per_page?: number;
  limit?: number; // Max records to fetch across all pages
}

export interface ZohoExecuteParams {
  service: 'crm' | 'books' | 'creator' | 'sheets' | 'tasks' | 'billing' | 'email' | 'tables';
  resource: string;
  operation: string;
  [key: string]: any; // Additional parameters
}

/**
 * Zoho API Client Class
 * Handles all Zoho API interactions with proper authentication, region support, and error handling
 */
export class ZohoApiClient {
  private accessToken: string;
  private refreshToken: string;
  private clientId: string;
  private clientSecret: string;
  private region: ZohoRegion;
  private baseUrl: string;
  private axiosInstance: AxiosInstance;

  constructor(credentials: {
    accessToken: string;
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    region: ZohoRegion;
  }) {
    this.accessToken = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.region = credentials.region;
    this.baseUrl = getZohoApiBaseUrl(this.region);

    // Create axios instance with default config
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for automatic token refresh
    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for token refresh and error handling
   */
  private setupInterceptors(): void {
    // Response interceptor for handling 401 errors and token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // If 401 and we haven't retried yet, try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry && this.refreshToken) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refreshAccessToken();
            if (newToken) {
              originalRequest.headers['Authorization'] = `Zoho-oauthtoken ${newToken}`;
              this.accessToken = newToken;
              return this.axiosInstance(originalRequest);
            }
          } catch (refreshError) {
            console.error('[ZohoAPI] Token refresh failed:', refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<string | null> {
    try {
      const tokenEndpoint = getZohoTokenEndpoint(this.region);
      const response = await axios.post(tokenEndpoint, null, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token',
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data?.access_token) {
        this.accessToken = response.data.access_token;
        return response.data.access_token;
      }
      return null;
    } catch (error) {
      console.error('[ZohoAPI] Token refresh error:', error);
      return null;
    }
  }

  /**
   * Make API request with proper error handling
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    url: string,
    data?: any,
    params?: any,
    headers?: Record<string, string>
  ): Promise<ZohoApiResponse<T>> {
    try {
      // Extract default headers as plain object
      const defaultHeaders = this.axiosInstance.defaults.headers?.common || {};
      const mergedHeaders = {
        ...defaultHeaders,
        ...headers,
      } as Record<string, string>;

      const response = await this.axiosInstance.request<T>({
        method,
        url,
        data,
        params,
        headers: mergedHeaders,
      });

      return {
        success: true,
        data: response.data as T | undefined,
      };
    } catch (error: any) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;
      const errorData = axiosError.response?.data as any;

      return {
        success: false,
        error: {
          message: errorData?.message || errorData?.error?.message || axiosError.message || 'Zoho API request failed',
          statusCode: statusCode || 500,
          code: errorData?.code || errorData?.error?.code,
          details: errorData,
        },
      };
    }
  }

  /**
   * Handle pagination for list operations
   */
  private async fetchPaginated<T>(
    url: string,
    params: ZohoPaginationParams = {},
    accumulator: T[] = [] as T[]
  ): Promise<ZohoApiResponse<T[]>> {
    const page = params.page || 1;
    const perPage = params.per_page || 200;
    const limit = params.limit || 1000; // Default max records

    const response = await this.makeRequest<{ data?: T[]; info?: { page?: number; per_page?: number; count?: number; more_records?: boolean } }>(
      'GET',
      url,
      undefined,
      { page, per_page: perPage }
    );

    if (!response.success) {
      return response as ZohoApiResponse<T[]>;
    }

    const responseData = response.data as any;
    const records = responseData?.data || responseData || [];
    const allRecords = [...accumulator, ...(Array.isArray(records) ? records : [records])];

    // Check if we should fetch more pages
    const info = responseData?.info || {};
    const hasMore = info.more_records !== false && allRecords.length < limit;
    const nextPage = info.page ? info.page + 1 : page + 1;

    if (hasMore && allRecords.length < limit) {
      return this.fetchPaginated<T>(url, { ...params, page: nextPage }, allRecords);
    }

    return {
      success: true,
      data: allRecords.slice(0, limit), // Respect limit
    };
  }

  /**
   * Main execute method - routes to appropriate service handler
   */
  async execute(params: ZohoExecuteParams): Promise<ZohoApiResponse> {
    const { service, resource, operation, ...restParams } = params;

    try {
      switch (service) {
        case 'crm':
          return await this.executeCrm(resource, operation, restParams);
        case 'books':
          return await this.executeBooks(resource, operation, restParams);
        case 'creator':
          return await this.executeCreator(resource, operation, restParams);
        case 'sheets':
          return await this.executeSheets(resource, operation, restParams);
        case 'tasks':
          return await this.executeTasks(resource, operation, restParams);
        case 'billing':
          return await this.executeBilling(resource, operation, restParams);
        case 'email':
          return await this.executeEmail(resource, operation, restParams);
        case 'tables':
          return await this.executeTables(resource, operation, restParams);
        default:
          return {
            success: false,
            error: {
              message: `Unknown service: ${service}`,
              statusCode: 400,
            },
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.message || 'Zoho API execution failed',
          statusCode: 500,
          details: error,
        },
      };
    }
  }

  // ============================================
  // CRM SERVICE HANDLERS
  // ============================================

  private async executeCrm(resource: string, operation: string, params: any): Promise<ZohoApiResponse> {
    switch (resource) {
      case 'record':
        return await this.crmRecord(operation, params);
      case 'bulk_read':
        return await this.crmBulkRead(operation, params);
      case 'related_list':
        return await this.crmRelatedList(operation, params);
      case 'attachment':
        return await this.crmAttachment(operation, params);
      case 'note':
        return await this.crmNote(operation, params);
      case 'tag':
        return await this.crmTag(operation, params);
      case 'blueprint':
        return await this.crmBlueprint(operation, params);
      case 'user':
        return await this.crmUser(operation, params);
      case 'organization':
        return await this.crmOrganization(operation, params);
      case 'module_metadata':
        return await this.crmModuleMetadata(operation, params);
      case 'coql':
        return await this.crmCoql(operation, params);
      default:
        return {
          success: false,
          error: { message: `Unknown CRM resource: ${resource}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM Record operations
   */
  private async crmRecord(operation: string, params: any): Promise<ZohoApiResponse> {
    const { module, recordId, externalId, data, searchCriteria, ...rest } = params;

    if (!module) {
      return {
        success: false,
        error: { message: 'Module is required for CRM record operations', statusCode: 400 },
      };
    }

    const modulePath = `/crm/v3/${module}`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.sort_by) listParams.sort_by = rest.sort_by;
        if (rest.sort_order) listParams.sort_order = rest.sort_order;
        if (rest.fields) listParams.fields = rest.fields;
        if (rest.criteria) listParams.criteria = rest.criteria;

        if (rest.fetch_all && rest.fetch_all === true) {
          return this.fetchPaginated(`${modulePath}`, listParams);
        }
        return this.makeRequest('GET', modulePath, undefined, listParams);
      }

      case 'get': {
        if (!recordId && !externalId) {
          return {
            success: false,
            error: { message: 'recordId or externalId is required for get operation', statusCode: 400 },
          };
        }
        const id = externalId ? `External/${externalId}` : recordId;
        return this.makeRequest('GET', `${modulePath}/${id}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        const createData = Array.isArray(data) ? { data } : { data: [data] };
        return this.makeRequest('POST', modulePath, createData);
      }

      case 'update': {
        if (!recordId && !externalId) {
          return {
            success: false,
            error: { message: 'recordId or externalId is required for update operation', statusCode: 400 },
          };
        }
        const id = externalId ? `External/${externalId}` : recordId;
        const updateData = Array.isArray(data) ? { data } : { data: [data] };
        return this.makeRequest('PUT', `${modulePath}/${id}`, updateData);
      }

      case 'delete': {
        if (!recordId) {
          return {
            success: false,
            error: { message: 'recordId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${modulePath}/${recordId}`);
      }

      case 'search': {
        if (!searchCriteria && !rest.criteria) {
          return {
            success: false,
            error: { message: 'searchCriteria or criteria is required for search operation', statusCode: 400 },
          };
        }
        const searchParams: any = {
          criteria: searchCriteria || rest.criteria,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', `${modulePath}/search`, undefined, searchParams);
      }

      case 'upsert': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for upsert operation', statusCode: 400 },
          };
        }
        const upsertData = Array.isArray(data) ? { data } : { data: [data] };
        const upsertParams: any = {};
        if (rest.duplicate_check_fields) {
          upsertParams.duplicate_check_fields = rest.duplicate_check_fields;
        }
        return this.makeRequest('POST', `${modulePath}/upsert`, upsertData, upsertParams);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown CRM record operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM Bulk Read operations
   */
  private async crmBulkRead(operation: string, params: any): Promise<ZohoApiResponse> {
    const { module, jobId, query, fields, ...rest } = params;

    if (!module) {
      return {
        success: false,
        error: { message: 'Module is required for bulk read operations', statusCode: 400 },
      };
    }

    switch (operation) {
      case 'create_job': {
        if (!query && !fields) {
          return {
            success: false,
            error: { message: 'query or fields is required for create_job operation', statusCode: 400 },
          };
        }
        const jobData: any = {};
        if (query) jobData.query = query;
        if (fields) jobData.fields = fields;
        if (rest.criteria) jobData.criteria = rest.criteria;
        return this.makeRequest('POST', `/crm/bulk/v3/read/${module}`, jobData);
      }

      case 'get_job': {
        if (!jobId) {
          return {
            success: false,
            error: { message: 'jobId is required for get_job operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `/crm/bulk/v3/read/${module}/${jobId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown bulk read operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM Related List operations
   */
  private async crmRelatedList(operation: string, params: any): Promise<ZohoApiResponse> {
    const { module, recordId, relatedModule, data, ...rest } = params;

    if (!module || !recordId || !relatedModule) {
      return {
        success: false,
        error: { message: 'module, recordId, and relatedModule are required for related list operations', statusCode: 400 },
      };
    }

    const basePath = `/crm/v3/${module}/${recordId}/${relatedModule}`;

    switch (operation) {
      case 'get': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.fields) listParams.fields = rest.fields;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'update': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for update operation', statusCode: 400 },
          };
        }
        const updateData = Array.isArray(data) ? { data } : { data: [data] };
        return this.makeRequest('PUT', basePath, updateData);
      }

      case 'delink': {
        if (!rest.relatedRecordId) {
          return {
            success: false,
            error: { message: 'relatedRecordId is required for delink operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${rest.relatedRecordId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown related list operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM Attachment operations
   */
  private async crmAttachment(operation: string, params: any): Promise<ZohoApiResponse> {
    const { module, recordId, attachmentId, file, fileUrl, fileName, ...rest } = params;

    if (!module || !recordId) {
      return {
        success: false,
        error: { message: 'module and recordId are required for attachment operations', statusCode: 400 },
      };
    }

    const basePath = `/crm/v3/${module}/${recordId}/Attachments`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'upload': {
        if (!file && !fileUrl) {
          return {
            success: false,
            error: { message: 'file or fileUrl is required for upload operation', statusCode: 400 },
          };
        }

        // Handle file upload - Zoho requires multipart/form-data
        const formData = new FormData();

        if (file) {
          // If file is base64, convert it
          if (typeof file === 'string' && file.startsWith('data:')) {
            const base64Data = file.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            formData.append('file', buffer, fileName || 'file');
          } else if (Buffer.isBuffer(file)) {
            formData.append('file', file, fileName || 'file');
          } else {
            formData.append('file', file, fileName || 'file');
          }
        } else if (fileUrl) {
          // Download file from URL and upload
          const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
          formData.append('file', Buffer.from(fileResponse.data), fileName || 'file');
        }

        return this.makeRequest('POST', basePath, formData, undefined, {
          'Content-Type': 'multipart/form-data',
        });
      }

      case 'delete': {
        if (!attachmentId) {
          return {
            success: false,
            error: { message: 'attachmentId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${attachmentId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown attachment operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM Note operations
   */
  private async crmNote(operation: string, params: any): Promise<ZohoApiResponse> {
    const { module, recordId, noteId, content, ...rest } = params;

    if (!module || !recordId) {
      return {
        success: false,
        error: { message: 'module and recordId are required for note operations', statusCode: 400 },
      };
    }

    const basePath = `/crm/v3/${module}/${recordId}/Notes`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'create': {
        if (!content) {
          return {
            success: false,
            error: { message: 'content is required for create operation', statusCode: 400 },
          };
        }
        const noteData = {
          Note_Title: rest.title || 'Note',
          Note_Content: content,
          ...rest.data,
        };
        return this.makeRequest('POST', basePath, { data: [noteData] });
      }

      case 'update': {
        if (!noteId || !content) {
          return {
            success: false,
            error: { message: 'noteId and content are required for update operation', statusCode: 400 },
          };
        }
        const noteData = {
          Note_Title: rest.title,
          Note_Content: content,
          ...rest.data,
        };
        return this.makeRequest('PUT', `${basePath}/${noteId}`, { data: [noteData] });
      }

      case 'delete': {
        if (!noteId) {
          return {
            success: false,
            error: { message: 'noteId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${noteId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown note operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM Tag operations
   */
  private async crmTag(operation: string, params: any): Promise<ZohoApiResponse> {
    const { module, tagName, tagId, mergeTagId, ...rest } = params;

    if (!module) {
      return {
        success: false,
        error: { message: 'Module is required for tag operations', statusCode: 400 },
      };
    }

    const basePath = `/crm/v3/${module}/actions/merge_tags`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', `/crm/v3/settings/tags`, undefined, listParams);
      }

      case 'create': {
        if (!tagName) {
          return {
            success: false,
            error: { message: 'tagName is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', `/crm/v3/settings/tags`, { tags: [{ name: tagName }] });
      }

      case 'delete': {
        if (!tagId) {
          return {
            success: false,
            error: { message: 'tagId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `/crm/v3/settings/tags/${tagId}`);
      }

      case 'merge': {
        if (!tagId || !mergeTagId) {
          return {
            success: false,
            error: { message: 'tagId and mergeTagId are required for merge operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, {
          tags: [{ id: tagId }, { id: mergeTagId }],
        });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown tag operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM Blueprint operations
   */
  private async crmBlueprint(operation: string, params: any): Promise<ZohoApiResponse> {
    const { module, recordId, blueprintData, ...rest } = params;

    if (!module || !recordId) {
      return {
        success: false,
        error: { message: 'module and recordId are required for blueprint operations', statusCode: 400 },
      };
    }

    const basePath = `/crm/v3/${module}/${recordId}/actions/blueprint`;

    switch (operation) {
      case 'get': {
        return this.makeRequest('GET', basePath);
      }

      case 'update': {
        if (!blueprintData) {
          return {
            success: false,
            error: { message: 'blueprintData is required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', basePath, blueprintData);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown blueprint operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM User operations
   */
  private async crmUser(operation: string, params: any): Promise<ZohoApiResponse> {
    const { userId, userData, ...rest } = params;

    const basePath = '/crm/v3/users';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.type) listParams.type = rest.type;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!userId) {
          return {
            success: false,
            error: { message: 'userId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${userId}`);
      }

      case 'create': {
        if (!userData) {
          return {
            success: false,
            error: { message: 'userData is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { users: [userData] });
      }

      case 'update': {
        if (!userId || !userData) {
          return {
            success: false,
            error: { message: 'userId and userData are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${userId}`, { users: [userData] });
      }

      case 'delete': {
        if (!userId) {
          return {
            success: false,
            error: { message: 'userId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${userId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown user operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM Organization operations
   */
  private async crmOrganization(operation: string, params: any): Promise<ZohoApiResponse> {
    switch (operation) {
      case 'get': {
        return this.makeRequest('GET', '/crm/v3/org');
      }

      default:
        return {
          success: false,
          error: { message: `Unknown organization operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM Module Metadata operations
   */
  private async crmModuleMetadata(operation: string, params: any): Promise<ZohoApiResponse> {
    const { module, metadataType, ...rest } = params;

    if (!module) {
      return {
        success: false,
        error: { message: 'Module is required for module metadata operations', statusCode: 400 },
      };
    }

    switch (operation) {
      case 'list_fields': {
        return this.makeRequest('GET', `/crm/v3/settings/fields?module=${module}`);
      }

      case 'list_layouts': {
        return this.makeRequest('GET', `/crm/v3/settings/layouts?module=${module}`);
      }

      case 'list_custom_views': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', `/crm/v3/settings/custom_views?module=${module}`, undefined, listParams);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown module metadata operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * CRM COQL (Zoho Query Language) operations
   */
  private async crmCoql(operation: string, params: any): Promise<ZohoApiResponse> {
    const { selectQuery, ...rest } = params;

    if (operation !== 'execute') {
      return {
        success: false,
        error: { message: `Unknown COQL operation: ${operation}`, statusCode: 400 },
      };
    }

    if (!selectQuery) {
      return {
        success: false,
        error: { message: 'selectQuery is required for COQL execute operation', statusCode: 400 },
      };
    }

    const coqlParams: any = {
      select_query: selectQuery,
    };
    if (rest.page) coqlParams.page = rest.page;
    if (rest.per_page) coqlParams.per_page = rest.per_page;

    return this.makeRequest('GET', '/crm/v3/coql', undefined, coqlParams);
  }

  // ============================================
  // ZOHO BOOKS SERVICE HANDLERS
  // ============================================

  private async executeBooks(resource: string, operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, ...rest } = params;

    if (!organization_id) {
      return {
        success: false,
        error: { message: 'organization_id is required for all Books operations', statusCode: 400 },
      };
    }

    switch (resource) {
      case 'organization':
        return await this.booksOrganization(operation, { organization_id, ...rest });
      case 'contact':
      case 'customer':
        return await this.booksContact(operation, { organization_id, ...rest });
      case 'invoice':
        return await this.booksInvoice(operation, { organization_id, ...rest });
      case 'estimate':
        return await this.booksEstimate(operation, { organization_id, ...rest });
      case 'item':
      case 'product':
        return await this.booksItem(operation, { organization_id, ...rest });
      case 'bill':
        return await this.booksBill(operation, { organization_id, ...rest });
      case 'expense':
        return await this.booksExpense(operation, { organization_id, ...rest });
      case 'payment':
        return await this.booksPayment(operation, { organization_id, ...rest });
      case 'credit_note':
        return await this.booksCreditNote(operation, { organization_id, ...rest });
      case 'vendor':
        return await this.booksVendor(operation, { organization_id, ...rest });
      case 'tax':
        return await this.booksTax(operation, { organization_id, ...rest });
      case 'bank_account':
        return await this.booksBankAccount(operation, { organization_id, ...rest });
      case 'journal':
        return await this.booksJournal(operation, { organization_id, ...rest });
      case 'purchase_order':
        return await this.booksPurchaseOrder(operation, { organization_id, ...rest });
      case 'sales_order':
        return await this.booksSalesOrder(operation, { organization_id, ...rest });
      case 'recurring_invoice':
        return await this.booksRecurringInvoice(operation, { organization_id, ...rest });
      case 'project':
        return await this.booksProject(operation, { organization_id, ...rest });
      case 'timesheet':
        return await this.booksTimesheet(operation, { organization_id, ...rest });
      default:
        return {
          success: false,
          error: { message: `Unknown Books resource: ${resource}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Organization operations
   */
  private async booksOrganization(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id } = params;

    switch (operation) {
      case 'list':
      case 'get': {
        return this.makeRequest('GET', `/books/v3/organizations/${organization_id}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown organization operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Contact/Customer operations
   */
  private async booksContact(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, contactId, customerId, data, ...rest } = params;
    const id = contactId || customerId;
    const basePath = `/books/v3/contacts`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.filter_by) listParams.filter_by = rest.filter_by;
        if (rest.sort_column) listParams.sort_column = rest.sort_column;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!id) {
          return {
            success: false,
            error: { message: 'contactId or customerId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${id}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!id || !data) {
          return {
            success: false,
            error: { message: 'contactId/customerId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${id}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!id) {
          return {
            success: false,
            error: { message: 'contactId or customerId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${id}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown contact operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Invoice operations
   */
  private async booksInvoice(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, invoiceId, data, ...rest } = params;
    const basePath = `/books/v3/invoices`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.filter_by) listParams.filter_by = rest.filter_by;
        if (rest.sort_column) listParams.sort_column = rest.sort_column;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!invoiceId) {
          return {
            success: false,
            error: { message: 'invoiceId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${invoiceId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!invoiceId || !data) {
          return {
            success: false,
            error: { message: 'invoiceId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${invoiceId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!invoiceId) {
          return {
            success: false,
            error: { message: 'invoiceId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${invoiceId}`, undefined, { organization_id });
      }

      case 'email': {
        if (!invoiceId) {
          return {
            success: false,
            error: { message: 'invoiceId is required for email operation', statusCode: 400 },
          };
        }
        const emailData = {
          send_from_org_email_id: rest.send_from_org_email_id || false,
          to_mail_ids: rest.to_mail_ids || [],
          cc_mail_ids: rest.cc_mail_ids || [],
          subject: rest.subject,
          body: rest.body,
        };
        return this.makeRequest('POST', `${basePath}/${invoiceId}/email`, { ...emailData, organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown invoice operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Estimate operations
   */
  private async booksEstimate(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, estimateId, data, ...rest } = params;
    const basePath = `/books/v3/estimates`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.filter_by) listParams.filter_by = rest.filter_by;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!estimateId) {
          return {
            success: false,
            error: { message: 'estimateId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${estimateId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!estimateId || !data) {
          return {
            success: false,
            error: { message: 'estimateId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${estimateId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!estimateId) {
          return {
            success: false,
            error: { message: 'estimateId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${estimateId}`, undefined, { organization_id });
      }

      case 'convert_to_invoice': {
        if (!estimateId || !data) {
          return {
            success: false,
            error: { message: 'estimateId and data are required for convert_to_invoice operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', `${basePath}/${estimateId}/invoices`, { ...data, organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown estimate operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Item/Product operations
   */
  private async booksItem(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, itemId, productId, data, ...rest } = params;
    const id = itemId || productId;
    const basePath = `/books/v3/items`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.filter_by) listParams.filter_by = rest.filter_by;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!id) {
          return {
            success: false,
            error: { message: 'itemId or productId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${id}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!id || !data) {
          return {
            success: false,
            error: { message: 'itemId/productId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${id}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!id) {
          return {
            success: false,
            error: { message: 'itemId or productId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${id}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown item operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Bill operations
   */
  private async booksBill(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, billId, data, ...rest } = params;
    const basePath = `/books/v3/bills`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.filter_by) listParams.filter_by = rest.filter_by;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!billId) {
          return {
            success: false,
            error: { message: 'billId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${billId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!billId || !data) {
          return {
            success: false,
            error: { message: 'billId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${billId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!billId) {
          return {
            success: false,
            error: { message: 'billId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${billId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown bill operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Expense operations
   */
  private async booksExpense(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, expenseId, data, ...rest } = params;
    const basePath = `/books/v3/expenses`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.filter_by) listParams.filter_by = rest.filter_by;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!expenseId) {
          return {
            success: false,
            error: { message: 'expenseId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${expenseId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!expenseId || !data) {
          return {
            success: false,
            error: { message: 'expenseId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${expenseId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!expenseId) {
          return {
            success: false,
            error: { message: 'expenseId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${expenseId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown expense operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Payment operations
   */
  private async booksPayment(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, paymentId, data, ...rest } = params;
    const basePath = `/books/v3/customerpayments`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.invoice_id) listParams.invoice_id = rest.invoice_id;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!paymentId) {
          return {
            success: false,
            error: { message: 'paymentId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${paymentId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'delete': {
        if (!paymentId) {
          return {
            success: false,
            error: { message: 'paymentId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${paymentId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown payment operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Credit Note operations
   */
  private async booksCreditNote(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, creditNoteId, data, ...rest } = params;
    const basePath = `/books/v3/creditnotes`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.filter_by) listParams.filter_by = rest.filter_by;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!creditNoteId) {
          return {
            success: false,
            error: { message: 'creditNoteId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${creditNoteId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!creditNoteId || !data) {
          return {
            success: false,
            error: { message: 'creditNoteId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${creditNoteId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!creditNoteId) {
          return {
            success: false,
            error: { message: 'creditNoteId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${creditNoteId}`, undefined, { organization_id });
      }

      case 'refund': {
        if (!creditNoteId || !data) {
          return {
            success: false,
            error: { message: 'creditNoteId and data are required for refund operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', `${basePath}/${creditNoteId}/refunds`, { ...data, organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown credit note operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Vendor operations
   */
  private async booksVendor(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, vendorId, data, ...rest } = params;
    const basePath = `/books/v3/vendors`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!vendorId) {
          return {
            success: false,
            error: { message: 'vendorId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${vendorId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!vendorId || !data) {
          return {
            success: false,
            error: { message: 'vendorId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${vendorId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!vendorId) {
          return {
            success: false,
            error: { message: 'vendorId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${vendorId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown vendor operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Tax operations
   */
  private async booksTax(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, taxId, ...rest } = params;
    const basePath = `/books/v3/settings/taxes`;

    switch (operation) {
      case 'list': {
        return this.makeRequest('GET', basePath, undefined, { organization_id });
      }

      case 'get': {
        if (!taxId) {
          return {
            success: false,
            error: { message: 'taxId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${taxId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown tax operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Bank Account operations
   */
  private async booksBankAccount(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, accountId, ...rest } = params;
    const basePath = `/books/v3/bankaccounts`;

    switch (operation) {
      case 'list': {
        return this.makeRequest('GET', basePath, undefined, { organization_id });
      }

      case 'get': {
        if (!accountId) {
          return {
            success: false,
            error: { message: 'accountId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${accountId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown bank account operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Journal operations
   */
  private async booksJournal(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, journalId, data, ...rest } = params;
    const basePath = `/books/v3/journalentries`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!journalId) {
          return {
            success: false,
            error: { message: 'journalId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${journalId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown journal operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Purchase Order operations
   */
  private async booksPurchaseOrder(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, purchaseOrderId, data, ...rest } = params;
    const basePath = `/books/v3/purchaseorders`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!purchaseOrderId) {
          return {
            success: false,
            error: { message: 'purchaseOrderId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${purchaseOrderId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!purchaseOrderId || !data) {
          return {
            success: false,
            error: { message: 'purchaseOrderId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${purchaseOrderId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!purchaseOrderId) {
          return {
            success: false,
            error: { message: 'purchaseOrderId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${purchaseOrderId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown purchase order operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Sales Order operations
   */
  private async booksSalesOrder(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, salesOrderId, data, ...rest } = params;
    const basePath = `/books/v3/salesorders`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!salesOrderId) {
          return {
            success: false,
            error: { message: 'salesOrderId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${salesOrderId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!salesOrderId || !data) {
          return {
            success: false,
            error: { message: 'salesOrderId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${salesOrderId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!salesOrderId) {
          return {
            success: false,
            error: { message: 'salesOrderId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${salesOrderId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown sales order operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Recurring Invoice operations
   */
  private async booksRecurringInvoice(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, recurringInvoiceId, data, ...rest } = params;
    const basePath = `/books/v3/recurringinvoices`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!recurringInvoiceId) {
          return {
            success: false,
            error: { message: 'recurringInvoiceId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${recurringInvoiceId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!recurringInvoiceId || !data) {
          return {
            success: false,
            error: { message: 'recurringInvoiceId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${recurringInvoiceId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!recurringInvoiceId) {
          return {
            success: false,
            error: { message: 'recurringInvoiceId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${recurringInvoiceId}`, undefined, { organization_id });
      }

      case 'stop': {
        if (!recurringInvoiceId) {
          return {
            success: false,
            error: { message: 'recurringInvoiceId is required for stop operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', `${basePath}/${recurringInvoiceId}/stop`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown recurring invoice operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Project operations
   */
  private async booksProject(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, projectId, data, ...rest } = params;
    const basePath = `/books/v3/projects`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!projectId) {
          return {
            success: false,
            error: { message: 'projectId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${projectId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!projectId || !data) {
          return {
            success: false,
            error: { message: 'projectId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${projectId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!projectId) {
          return {
            success: false,
            error: { message: 'projectId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${projectId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown project operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Books Timesheet operations
   */
  private async booksTimesheet(operation: string, params: any): Promise<ZohoApiResponse> {
    const { organization_id, timesheetId, data, ...rest } = params;
    const basePath = `/books/v3/projects/${rest.project_id}/timeentries`;

    if (!rest.project_id) {
      return {
        success: false,
        error: { message: 'project_id is required for timesheet operations', statusCode: 400 },
      };
    }

    switch (operation) {
      case 'list': {
        const listParams: any = {
          organization_id,
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!timesheetId) {
          return {
            success: false,
            error: { message: 'timesheetId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${timesheetId}`, undefined, { organization_id });
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { ...data, organization_id });
      }

      case 'update': {
        if (!timesheetId || !data) {
          return {
            success: false,
            error: { message: 'timesheetId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${timesheetId}`, { ...data, organization_id });
      }

      case 'delete': {
        if (!timesheetId) {
          return {
            success: false,
            error: { message: 'timesheetId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${timesheetId}`, undefined, { organization_id });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown timesheet operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  // ============================================
  // ZOHO CREATOR SERVICE HANDLERS
  // ============================================

  private async executeCreator(resource: string, operation: string, params: any): Promise<ZohoApiResponse> {
    switch (resource) {
      case 'application':
        return await this.creatorApplication(operation, params);
      case 'form':
        return await this.creatorForm(operation, params);
      case 'record':
        return await this.creatorRecord(operation, params);
      case 'report':
        return await this.creatorReport(operation, params);
      default:
        return {
          success: false,
          error: { message: `Unknown Creator resource: ${resource}`, statusCode: 400 },
        };
    }
  }

  /**
   * Creator Application operations
   */
  private async creatorApplication(operation: string, params: any): Promise<ZohoApiResponse> {
    const { owner_name, app_link_name, ...rest } = params;

    switch (operation) {
      case 'list': {
        if (!owner_name) {
          return {
            success: false,
            error: { message: 'owner_name is required for list operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `/creator/v1/${owner_name}/applications`);
      }

      case 'get': {
        if (!owner_name || !app_link_name) {
          return {
            success: false,
            error: { message: 'owner_name and app_link_name are required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `/creator/v1/${owner_name}/applications/${app_link_name}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown application operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Creator Form operations
   */
  private async creatorForm(operation: string, params: any): Promise<ZohoApiResponse> {
    const { owner_name, app_link_name, form_link_name, ...rest } = params;

    if (!owner_name || !app_link_name) {
      return {
        success: false,
        error: { message: 'owner_name and app_link_name are required for form operations', statusCode: 400 },
      };
    }

    switch (operation) {
      case 'list': {
        return this.makeRequest('GET', `/creator/v1/${owner_name}/applications/${app_link_name}/forms`);
      }

      case 'get': {
        if (!form_link_name) {
          return {
            success: false,
            error: { message: 'form_link_name is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `/creator/v1/${owner_name}/applications/${app_link_name}/forms/${form_link_name}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown form operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Creator Record operations
   */
  private async creatorRecord(operation: string, params: any): Promise<ZohoApiResponse> {
    const { owner_name, app_link_name, form_link_name, recordId, data, searchCriteria, ...rest } = params;

    if (!owner_name || !app_link_name || !form_link_name) {
      return {
        success: false,
        error: { message: 'owner_name, app_link_name, and form_link_name are required for record operations', statusCode: 400 },
      };
    }

    const basePath = `/creator/v1/${owner_name}/applications/${app_link_name}/forms/${form_link_name}/records`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          limit: rest.limit || 200,
          offset: rest.offset || 0,
        };
        if (rest.sort_by) listParams.sort_by = rest.sort_by;
        if (rest.sort_order) listParams.sort_order = rest.sort_order;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!recordId) {
          return {
            success: false,
            error: { message: 'recordId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${recordId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!recordId || !data) {
          return {
            success: false,
            error: { message: 'recordId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${recordId}`, data);
      }

      case 'delete': {
        if (!recordId) {
          return {
            success: false,
            error: { message: 'recordId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${recordId}`);
      }

      case 'search': {
        if (!searchCriteria) {
          return {
            success: false,
            error: { message: 'searchCriteria is required for search operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', `${basePath}/search`, { criteria: searchCriteria });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown record operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Creator Report operations
   */
  private async creatorReport(operation: string, params: any): Promise<ZohoApiResponse> {
    const { owner_name, app_link_name, report_link_name, ...rest } = params;

    if (!owner_name || !app_link_name) {
      return {
        success: false,
        error: { message: 'owner_name and app_link_name are required for report operations', statusCode: 400 },
      };
    }

    switch (operation) {
      case 'list': {
        return this.makeRequest('GET', `/creator/v1/${owner_name}/applications/${app_link_name}/reports`);
      }

      case 'get': {
        if (!report_link_name) {
          return {
            success: false,
            error: { message: 'report_link_name is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `/creator/v1/${owner_name}/applications/${app_link_name}/reports/${report_link_name}`);
      }

      case 'get_records': {
        if (!report_link_name) {
          return {
            success: false,
            error: { message: 'report_link_name is required for get_records operation', statusCode: 400 },
          };
        }
        const listParams: any = {
          limit: rest.limit || 200,
          offset: rest.offset || 0,
        };
        return this.makeRequest('GET', `/creator/v1/${owner_name}/applications/${app_link_name}/reports/${report_link_name}/records`, undefined, listParams);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown report operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  // ============================================
  // ZOHO SHEETS SERVICE HANDLERS
  // ============================================

  private async executeSheets(resource: string, operation: string, params: any): Promise<ZohoApiResponse> {
    switch (resource) {
      case 'workbook':
        return await this.sheetsWorkbook(operation, params);
      case 'worksheet':
        return await this.sheetsWorksheet(operation, params);
      case 'record':
        return await this.sheetsRecord(operation, params);
      default:
        return {
          success: false,
          error: { message: `Unknown Sheets resource: ${resource}`, statusCode: 400 },
        };
    }
  }

  /**
   * Sheets Workbook operations
   */
  private async sheetsWorkbook(operation: string, params: any): Promise<ZohoApiResponse> {
    const { workbookId, workbookName, ...rest } = params;
    const basePath = '/api/v1/workbooks';

    switch (operation) {
      case 'list': {
        return this.makeRequest('GET', basePath);
      }

      case 'create': {
        if (!workbookName) {
          return {
            success: false,
            error: { message: 'workbookName is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { workbook_name: workbookName });
      }

      case 'get': {
        if (!workbookId) {
          return {
            success: false,
            error: { message: 'workbookId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${workbookId}`);
      }

      case 'delete': {
        if (!workbookId) {
          return {
            success: false,
            error: { message: 'workbookId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${workbookId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown workbook operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Sheets Worksheet operations
   */
  private async sheetsWorksheet(operation: string, params: any): Promise<ZohoApiResponse> {
    const { workbookId, worksheetName, worksheetId, ...rest } = params;

    if (!workbookId) {
      return {
        success: false,
        error: { message: 'workbookId is required for worksheet operations', statusCode: 400 },
      };
    }

    const basePath = `/api/v1/workbooks/${workbookId}/worksheets`;

    switch (operation) {
      case 'list': {
        return this.makeRequest('GET', basePath);
      }

      case 'get': {
        if (!worksheetId && !worksheetName) {
          return {
            success: false,
            error: { message: 'worksheetId or worksheetName is required for get operation', statusCode: 400 },
          };
        }
        const id = worksheetId || worksheetName;
        return this.makeRequest('GET', `${basePath}/${id}`);
      }

      case 'create': {
        if (!worksheetName) {
          return {
            success: false,
            error: { message: 'worksheetName is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, { worksheet_name: worksheetName });
      }

      default:
        return {
          success: false,
          error: { message: `Unknown worksheet operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Sheets Record operations
   */
  private async sheetsRecord(operation: string, params: any): Promise<ZohoApiResponse> {
    const { workbookId, worksheetName, recordId, data, ...rest } = params;

    if (!workbookId || !worksheetName) {
      return {
        success: false,
        error: { message: 'workbookId and worksheetName are required for record operations', statusCode: 400 },
      };
    }

    const basePath = `/api/v1/workbooks/${workbookId}/worksheets/${worksheetName}/records`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          limit: rest.limit || 200,
          offset: rest.offset || 0,
        };
        if (rest.has_header_row !== undefined) listParams.has_header_row = rest.has_header_row;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'add': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for add operation', statusCode: 400 },
          };
        }
        const recordData = Array.isArray(data) ? { records: data } : { records: [data] };
        return this.makeRequest('POST', basePath, recordData);
      }

      case 'update': {
        if (!recordId || !data) {
          return {
            success: false,
            error: { message: 'recordId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${recordId}`, { records: [data] });
      }

      case 'delete': {
        if (!recordId) {
          return {
            success: false,
            error: { message: 'recordId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${recordId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown record operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  // ============================================
  // ZOHO TASKS SERVICE HANDLERS
  // ============================================

  private async executeTasks(resource: string, operation: string, params: any): Promise<ZohoApiResponse> {
    switch (resource) {
      case 'personal_task':
        return await this.tasksPersonalTask(operation, params);
      case 'group_task':
        return await this.tasksGroupTask(operation, params);
      case 'project':
        return await this.tasksProject(operation, params);
      case 'subtask':
        return await this.tasksSubtask(operation, params);
      default:
        return {
          success: false,
          error: { message: `Unknown Tasks resource: ${resource}`, statusCode: 400 },
        };
    }
  }

  /**
   * Tasks Personal Task operations
   */
  private async tasksPersonalTask(operation: string, params: any): Promise<ZohoApiResponse> {
    const { taskId, data, ...rest } = params;
    const basePath = '/tasks/v1/tasks';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.status) listParams.status = rest.status;
        if (rest.priority) listParams.priority = rest.priority;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!taskId) {
          return {
            success: false,
            error: { message: 'taskId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${taskId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!taskId || !data) {
          return {
            success: false,
            error: { message: 'taskId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${taskId}`, data);
      }

      case 'delete': {
        if (!taskId) {
          return {
            success: false,
            error: { message: 'taskId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${taskId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown personal task operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Tasks Group Task operations
   */
  private async tasksGroupTask(operation: string, params: any): Promise<ZohoApiResponse> {
    const { groupId, taskId, data, ...rest } = params;

    if (!groupId) {
      return {
        success: false,
        error: { message: 'groupId is required for group task operations', statusCode: 400 },
      };
    }

    const basePath = `/tasks/v1/groups/${groupId}/tasks`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!taskId) {
          return {
            success: false,
            error: { message: 'taskId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${taskId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!taskId || !data) {
          return {
            success: false,
            error: { message: 'taskId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${taskId}`, data);
      }

      case 'delete': {
        if (!taskId) {
          return {
            success: false,
            error: { message: 'taskId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${taskId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown group task operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Tasks Project operations
   */
  private async tasksProject(operation: string, params: any): Promise<ZohoApiResponse> {
    const { projectId, data, ...rest } = params;
    const basePath = '/tasks/v1/projects';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!projectId) {
          return {
            success: false,
            error: { message: 'projectId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${projectId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!projectId || !data) {
          return {
            success: false,
            error: { message: 'projectId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${projectId}`, data);
      }

      case 'delete': {
        if (!projectId) {
          return {
            success: false,
            error: { message: 'projectId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${projectId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown project operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Tasks Subtask operations
   */
  private async tasksSubtask(operation: string, params: any): Promise<ZohoApiResponse> {
    const { taskId, subtaskId, data, ...rest } = params;

    if (!taskId) {
      return {
        success: false,
        error: { message: 'taskId is required for subtask operations', statusCode: 400 },
      };
    }

    const basePath = `/tasks/v1/tasks/${taskId}/subtasks`;

    switch (operation) {
      case 'list': {
        return this.makeRequest('GET', basePath);
      }

      case 'get': {
        if (!subtaskId) {
          return {
            success: false,
            error: { message: 'subtaskId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${subtaskId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!subtaskId || !data) {
          return {
            success: false,
            error: { message: 'subtaskId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${subtaskId}`, data);
      }

      case 'delete': {
        if (!subtaskId) {
          return {
            success: false,
            error: { message: 'subtaskId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${subtaskId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown subtask operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  // ============================================
  // ZOHO BILLING SERVICE HANDLERS
  // ============================================

  private async executeBilling(resource: string, operation: string, params: any): Promise<ZohoApiResponse> {
    switch (resource) {
      case 'customer':
        return await this.billingCustomer(operation, params);
      case 'product':
        return await this.billingProduct(operation, params);
      case 'plan':
        return await this.billingPlan(operation, params);
      case 'subscription':
        return await this.billingSubscription(operation, params);
      case 'invoice':
        return await this.billingInvoice(operation, params);
      case 'payment':
        return await this.billingPayment(operation, params);
      case 'addon':
        return await this.billingAddon(operation, params);
      case 'event':
        return await this.billingEvent(operation, params);
      default:
        return {
          success: false,
          error: { message: `Unknown Billing resource: ${resource}`, statusCode: 400 },
        };
    }
  }

  /**
   * Billing Customer operations
   */
  private async billingCustomer(operation: string, params: any): Promise<ZohoApiResponse> {
    const { customerId, data, ...rest } = params;
    const basePath = '/subscriptions/v1/customers';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!customerId) {
          return {
            success: false,
            error: { message: 'customerId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${customerId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!customerId || !data) {
          return {
            success: false,
            error: { message: 'customerId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${customerId}`, data);
      }

      case 'delete': {
        if (!customerId) {
          return {
            success: false,
            error: { message: 'customerId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${customerId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown customer operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Billing Product operations
   */
  private async billingProduct(operation: string, params: any): Promise<ZohoApiResponse> {
    const { productId, data, ...rest } = params;
    const basePath = '/subscriptions/v1/products';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!productId) {
          return {
            success: false,
            error: { message: 'productId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${productId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!productId || !data) {
          return {
            success: false,
            error: { message: 'productId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${productId}`, data);
      }

      case 'delete': {
        if (!productId) {
          return {
            success: false,
            error: { message: 'productId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${productId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown product operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Billing Plan operations
   */
  private async billingPlan(operation: string, params: any): Promise<ZohoApiResponse> {
    const { productId, planId, data, ...rest } = params;

    if (!productId) {
      return {
        success: false,
        error: { message: 'productId is required for plan operations', statusCode: 400 },
      };
    }

    const basePath = `/subscriptions/v1/products/${productId}/plans`;

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!planId) {
          return {
            success: false,
            error: { message: 'planId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${planId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!planId || !data) {
          return {
            success: false,
            error: { message: 'planId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${planId}`, data);
      }

      case 'delete': {
        if (!planId) {
          return {
            success: false,
            error: { message: 'planId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${planId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown plan operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Billing Subscription operations
   */
  private async billingSubscription(operation: string, params: any): Promise<ZohoApiResponse> {
    const { subscriptionId, data, ...rest } = params;
    const basePath = '/subscriptions/v1/subscriptions';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.customer_id) listParams.customer_id = rest.customer_id;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!subscriptionId) {
          return {
            success: false,
            error: { message: 'subscriptionId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${subscriptionId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!subscriptionId || !data) {
          return {
            success: false,
            error: { message: 'subscriptionId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${subscriptionId}`, data);
      }

      case 'cancel': {
        if (!subscriptionId) {
          return {
            success: false,
            error: { message: 'subscriptionId is required for cancel operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', `${basePath}/${subscriptionId}/cancel`, data || {});
      }

      default:
        return {
          success: false,
          error: { message: `Unknown subscription operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Billing Invoice operations
   */
  private async billingInvoice(operation: string, params: any): Promise<ZohoApiResponse> {
    const { subscriptionId, invoiceId, data, ...rest } = params;
    const basePath = '/subscriptions/v1/invoices';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (subscriptionId) listParams.subscription_id = subscriptionId;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!invoiceId) {
          return {
            success: false,
            error: { message: 'invoiceId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${invoiceId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'email': {
        if (!invoiceId) {
          return {
            success: false,
            error: { message: 'invoiceId is required for email operation', statusCode: 400 },
          };
        }
        const emailData = {
          to_mail_ids: rest.to_mail_ids || [],
          cc_mail_ids: rest.cc_mail_ids || [],
          subject: rest.subject,
          body: rest.body,
        };
        return this.makeRequest('POST', `${basePath}/${invoiceId}/email`, emailData);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown invoice operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Billing Payment operations
   */
  private async billingPayment(operation: string, params: any): Promise<ZohoApiResponse> {
    const { invoiceId, paymentId, data, ...rest } = params;
    const basePath = '/subscriptions/v1/payments';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (invoiceId) listParams.invoice_id = invoiceId;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!paymentId) {
          return {
            success: false,
            error: { message: 'paymentId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${paymentId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown payment operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Billing Addon operations
   */
  private async billingAddon(operation: string, params: any): Promise<ZohoApiResponse> {
    const { addonId, data, ...rest } = params;
    const basePath = '/subscriptions/v1/addons';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      case 'get': {
        if (!addonId) {
          return {
            success: false,
            error: { message: 'addonId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${addonId}`);
      }

      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', basePath, data);
      }

      case 'update': {
        if (!addonId || !data) {
          return {
            success: false,
            error: { message: 'addonId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${addonId}`, data);
      }

      case 'delete': {
        if (!addonId) {
          return {
            success: false,
            error: { message: 'addonId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${addonId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown addon operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Billing Event operations
   */
  private async billingEvent(operation: string, params: any): Promise<ZohoApiResponse> {
    const { eventId, ...rest } = params;
    const basePath = '/subscriptions/v1/events';

    switch (operation) {
      case 'list': {
        const listParams: any = {
          page: rest.page || 1,
          per_page: rest.per_page || 200,
        };
        if (rest.event_type) listParams.event_type = rest.event_type;
        return this.makeRequest('GET', basePath, undefined, listParams);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown event operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  // ============================================
  // ZOHO EMAIL SERVICE HANDLERS
  // ============================================

  private async executeEmail(resource: string, operation: string, params: any): Promise<ZohoApiResponse> {
    switch (resource) {
      case 'email':
        return await this.emailSend(operation, params);
      case 'account':
        return await this.emailAccount(operation, params);
      case 'schedule':
        return await this.emailSchedule(operation, params);
      default:
        return {
          success: false,
          error: { message: `Unknown Email resource: ${resource}`, statusCode: 400 },
        };
    }
  }

  /**
   * Email Send operations
   */
  private async emailSend(operation: string, params: any): Promise<ZohoApiResponse> {
    const { from_address, to_address, subject, content, ...rest } = params;
    const basePath = '/mail/v1/messages';

    switch (operation) {
      case 'sendImmediate': {
        if (!from_address || !to_address || !subject || !content) {
          return {
            success: false,
            error: { message: 'from_address, to_address, subject, and content are required for sendImmediate operation', statusCode: 400 },
          };
        }
        const emailData = {
          fromAddress: from_address,
          toAddress: Array.isArray(to_address) ? to_address : [to_address],
          subject: subject,
          content: content,
          mailFormat: rest.mailFormat || 'html',
          ccAddress: rest.cc_address ? (Array.isArray(rest.cc_address) ? rest.cc_address : [rest.cc_address]) : [],
          bccAddress: rest.bcc_address ? (Array.isArray(rest.bcc_address) ? rest.bcc_address : [rest.bcc_address]) : [],
        };
        return this.makeRequest('POST', `${basePath}/send`, emailData);
      }

      case 'sendScheduled': {
        if (!from_address || !to_address || !subject || !content || !rest.scheduled_time) {
          return {
            success: false,
            error: { message: 'from_address, to_address, subject, content, and scheduled_time are required for sendScheduled operation', statusCode: 400 },
          };
        }
        const emailData = {
          fromAddress: from_address,
          toAddress: Array.isArray(to_address) ? to_address : [to_address],
          subject: subject,
          content: content,
          mailFormat: rest.mailFormat || 'html',
          scheduledTime: rest.scheduled_time,
          ccAddress: rest.cc_address ? (Array.isArray(rest.cc_address) ? rest.cc_address : [rest.cc_address]) : [],
          bccAddress: rest.bcc_address ? (Array.isArray(rest.bcc_address) ? rest.bcc_address : [rest.bcc_address]) : [],
        };
        return this.makeRequest('POST', `${basePath}/schedule`, emailData);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown email send operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Email Account operations
   */
  private async emailAccount(operation: string, params: any): Promise<ZohoApiResponse> {
    const { accountId, ...rest } = params;
    const basePath = '/mail/v1/accounts';

    switch (operation) {
      case 'list': {
        return this.makeRequest('GET', basePath);
      }

      case 'get': {
        if (!accountId) {
          return {
            success: false,
            error: { message: 'accountId is required for get operation', statusCode: 400 },
          };
        }
        return this.makeRequest('GET', `${basePath}/${accountId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown account operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  /**
   * Email Schedule operations
   */
  private async emailSchedule(operation: string, params: any): Promise<ZohoApiResponse> {
    const { scheduleId, data, ...rest } = params;
    const basePath = '/mail/v1/schedules';

    switch (operation) {
      case 'list': {
        return this.makeRequest('GET', basePath);
      }

      case 'update': {
        if (!scheduleId || !data) {
          return {
            success: false,
            error: { message: 'scheduleId and data are required for update operation', statusCode: 400 },
          };
        }
        return this.makeRequest('PUT', `${basePath}/${scheduleId}`, data);
      }

      case 'delete': {
        if (!scheduleId) {
          return {
            success: false,
            error: { message: 'scheduleId is required for delete operation', statusCode: 400 },
          };
        }
        return this.makeRequest('DELETE', `${basePath}/${scheduleId}`);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown schedule operation: ${operation}`, statusCode: 400 },
        };
    }
  }

  // ============================================
  // ZOHO TABLES SERVICE HANDLERS
  // ============================================

  private async executeTables(resource: string, operation: string, params: any): Promise<ZohoApiResponse> {
    switch (resource) {
      case 'record':
        return await this.tablesRecord(operation, params);
      default:
        return {
          success: false,
          error: { message: `Unknown Tables resource: ${resource}`, statusCode: 400 },
        };
    }
  }

  /**
   * Tables Record operations
   */
  private async tablesRecord(operation: string, params: any): Promise<ZohoApiResponse> {
    const { tableId, recordId, data, searchCriteria, ...rest } = params;

    if (!tableId) {
      return {
        success: false,
        error: { message: 'tableId is required for record operations', statusCode: 400 },
      };
    }

    const basePath = `/api/v1/tables/${tableId}/records`;

    switch (operation) {
      case 'create': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for create operation', statusCode: 400 },
          };
        }
        const recordData = Array.isArray(data) ? { records: data } : { records: [data] };
        return this.makeRequest('POST', basePath, recordData);
      }

      case 'delete': {
        if (!recordId) {
          return {
            success: false,
            error: { message: 'recordId is required for delete operation', statusCode: 400 },
          };
        }
        const recordIds = Array.isArray(recordId) ? recordId : [recordId];
        return this.makeRequest('DELETE', basePath, { record_ids: recordIds });
      }

      case 'search': {
        if (!searchCriteria) {
          return {
            success: false,
            error: { message: 'searchCriteria is required for search operation', statusCode: 400 },
          };
        }
        return this.makeRequest('POST', `${basePath}/search`, { criteria: searchCriteria });
      }

      case 'upsert': {
        if (!data) {
          return {
            success: false,
            error: { message: 'data is required for upsert operation', statusCode: 400 },
          };
        }
        const recordData = Array.isArray(data) ? { records: data } : { records: [data] };
        const upsertParams: any = {};
        if (rest.matching_columns) {
          upsertParams.matching_columns = rest.matching_columns;
        }
        return this.makeRequest('POST', `${basePath}/upsert`, recordData, upsertParams);
      }

      default:
        return {
          success: false,
          error: { message: `Unknown record operation: ${operation}`, statusCode: 400 },
        };
    }
  }
}

// Export a factory function for easy instantiation
export function createZohoApiClient(credentials: {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  region: ZohoRegion;
}): ZohoApiClient {
  return new ZohoApiClient(credentials);
}
