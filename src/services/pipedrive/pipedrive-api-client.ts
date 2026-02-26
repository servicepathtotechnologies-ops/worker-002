/**
 * Pipedrive API Client
 * 
 * Comprehensive client for interacting with Pipedrive REST API v1.
 * Handles authentication, pagination, error handling, and all resource operations.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';

export interface PipedriveApiResponse<T = any> {
  success: boolean;
  data?: T;
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
      next_start?: number;
    };
  };
  error?: string;
  error_info?: string;
}

// Removed separate error interface - using PipedriveApiResponse with success: false

export class PipedriveApiClient {
  private axiosInstance: AxiosInstance;
  private baseUrl = 'https://api.pipedrive.com/v1';

  constructor(apiToken: string) {
    if (!apiToken || apiToken.trim() === '') {
      throw new Error('Pipedrive API token is required');
    }

    // Pipedrive API v1 uses api_token as query parameter for API tokens
    // OAuth tokens can use Bearer header, but for compatibility we'll use query parameter
    // Store token to add as query parameter to all requests
    this.apiToken = apiToken;
    
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });
  }

  private apiToken: string;

  /**
   * Make a GET request to Pipedrive API
   */
  private async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<PipedriveApiResponse<T>> {
    try {
      // Add api_token to query parameters
      const queryParams = { ...params, api_token: this.apiToken };
      const response = await this.axiosInstance.get<T>(endpoint, { params: queryParams });
      return response.data as PipedriveApiResponse<T>;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Make a POST request to Pipedrive API
   */
  private async post<T = any>(endpoint: string, data?: any): Promise<PipedriveApiResponse<T>> {
    try {
      // Add api_token to query parameters
      const response = await this.axiosInstance.post<T>(endpoint, data, {
        params: { api_token: this.apiToken }
      });
      return response.data as PipedriveApiResponse<T>;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Make a PUT request to Pipedrive API
   */
  private async put<T = any>(endpoint: string, data?: any): Promise<PipedriveApiResponse<T>> {
    try {
      // Add api_token to query parameters
      const response = await this.axiosInstance.put<T>(endpoint, data, {
        params: { api_token: this.apiToken }
      });
      return response.data as PipedriveApiResponse<T>;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Make a DELETE request to Pipedrive API
   */
  private async delete<T = any>(endpoint: string): Promise<PipedriveApiResponse<T>> {
    try {
      // Add api_token to query parameters
      const response = await this.axiosInstance.delete<T>(endpoint, {
        params: { api_token: this.apiToken }
      });
      return response.data as PipedriveApiResponse<T>;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handle errors from API requests
   */
  private handleError(error: unknown): PipedriveApiResponse {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<PipedriveApiResponse>;
      const statusCode = axiosError.response?.status;
      const responseData = axiosError.response?.data;

      return {
        success: false,
        error: responseData?.error || responseData?.error_info || axiosError.message || 'Unknown error',
        error_info: `Status: ${statusCode}`,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  /**
   * Fetch all pages for paginated endpoints
   */
  private async fetchAllPages<T = any>(
    endpoint: string,
    params: Record<string, any> = {},
    maxRecords?: number
  ): Promise<T[]> {
    const allItems: T[] = [];
    let start = params.start || 0;
    const limit = params.limit || 100;
    let hasMore = true;

    while (hasMore) {
      const response = await this.get<T[]>(endpoint, { ...params, start, limit });

      if (!response.success || !response.data) {
        break;
      }

      const items = Array.isArray(response.data) ? response.data : [];
      allItems.push(...items);

      // Check pagination
      const pagination = response.additional_data?.pagination;
      if (pagination?.more_items_in_collection && pagination.next_start !== undefined) {
        start = pagination.next_start;
        hasMore = true;
      } else {
        hasMore = false;
      }

      // Check max records limit
      if (maxRecords && allItems.length >= maxRecords) {
        return allItems.slice(0, maxRecords);
      }
    }

    return allItems;
  }

  // ==================== DEAL OPERATIONS ====================

  async getDeal(dealId: string | number): Promise<PipedriveApiResponse> {
    return this.get(`/deals/${dealId}`);
  }

  async listDeals(params?: {
    filterId?: number;
    stageId?: number;
    status?: string;
    sort?: string;
    limit?: number;
    start?: number;
  }): Promise<PipedriveApiResponse> {
    const { limit, ...queryParams } = params || {};
    
    if (limit && limit > 0) {
      // Fetch all pages up to limit
      const deals = await this.fetchAllPages('/deals', queryParams, limit);
      return { success: true, data: deals };
    } else {
      // Fetch all pages
      const deals = await this.fetchAllPages('/deals', queryParams);
      return { success: true, data: deals };
    }
  }

  async createDeal(data: {
    title: string;
    value?: number;
    currency?: string;
    person_id?: number;
    org_id?: number;
    stage_id?: number;
    status?: string;
    expected_close_date?: string;
    [key: string]: any;
  }): Promise<PipedriveApiResponse> {
    return this.post('/deals', data);
  }

  async updateDeal(dealId: string | number, data: Record<string, any>): Promise<PipedriveApiResponse> {
    return this.put(`/deals/${dealId}`, data);
  }

  async deleteDeal(dealId: string | number): Promise<PipedriveApiResponse> {
    return this.delete(`/deals/${dealId}`);
  }

  async duplicateDeal(dealId: string | number, newTitle?: string): Promise<PipedriveApiResponse> {
    return this.post(`/deals/${dealId}/duplicate`, newTitle ? { title: newTitle } : {});
  }

  async searchDeals(params: {
    term: string;
    fields?: string[];
    exact_match?: boolean;
  }): Promise<PipedriveApiResponse> {
    const queryParams: Record<string, any> = {
      term: params.term,
      exact_match: params.exact_match ? 1 : 0,
    };
    if (params.fields && params.fields.length > 0) {
      queryParams.fields = params.fields.join(',');
    }
    return this.get('/deals/search', queryParams);
  }

  async getDealActivities(dealId: string | number): Promise<PipedriveApiResponse> {
    return this.get(`/deals/${dealId}/activities`);
  }

  async getDealProducts(dealId: string | number): Promise<PipedriveApiResponse> {
    return this.get(`/deals/${dealId}/products`);
  }

  async addProductToDeal(
    dealId: string | number,
    data: {
      product_id: number;
      item_price: number;
      quantity: number;
      discount?: number;
      duration?: number;
    }
  ): Promise<PipedriveApiResponse> {
    return this.post(`/deals/${dealId}/products`, data);
  }

  // ==================== PERSON OPERATIONS ====================

  async getPerson(personId: number): Promise<PipedriveApiResponse> {
    return this.get(`/persons/${personId}`);
  }

  async listPersons(params?: {
    filterId?: number;
    limit?: number;
    start?: number;
  }): Promise<PipedriveApiResponse> {
    const { limit, ...queryParams } = params || {};
    
    if (limit && limit > 0) {
      const persons = await this.fetchAllPages('/persons', queryParams, limit);
      return { success: true, data: persons };
    } else {
      const persons = await this.fetchAllPages('/persons', queryParams);
      return { success: true, data: persons };
    }
  }

  async createPerson(data: {
    name: string;
    email?: string[];
    phone?: string[];
    org_id?: number;
    [key: string]: any;
  }): Promise<PipedriveApiResponse> {
    return this.post('/persons', data);
  }

  async updatePerson(personId: number, data: Record<string, any>): Promise<PipedriveApiResponse> {
    return this.put(`/persons/${personId}`, data);
  }

  async deletePerson(personId: number): Promise<PipedriveApiResponse> {
    return this.delete(`/persons/${personId}`);
  }

  async searchPersons(params: {
    term: string;
    fields?: string[];
    exact_match?: boolean;
  }): Promise<PipedriveApiResponse> {
    const queryParams: Record<string, any> = {
      term: params.term,
      exact_match: params.exact_match ? 1 : 0,
    };
    if (params.fields && params.fields.length > 0) {
      queryParams.fields = params.fields.join(',');
    }
    return this.get('/persons/search', queryParams);
  }

  async getPersonDeals(personId: number): Promise<PipedriveApiResponse> {
    return this.get(`/persons/${personId}/deals`);
  }

  async getPersonActivities(personId: number): Promise<PipedriveApiResponse> {
    return this.get(`/persons/${personId}/activities`);
  }

  // ==================== ORGANIZATION OPERATIONS ====================

  async getOrganization(orgId: number): Promise<PipedriveApiResponse> {
    return this.get(`/organizations/${orgId}`);
  }

  async listOrganizations(params?: {
    filterId?: number;
    limit?: number;
    start?: number;
  }): Promise<PipedriveApiResponse> {
    const { limit, ...queryParams } = params || {};
    
    if (limit && limit > 0) {
      const orgs = await this.fetchAllPages('/organizations', queryParams, limit);
      return { success: true, data: orgs };
    } else {
      const orgs = await this.fetchAllPages('/organizations', queryParams);
      return { success: true, data: orgs };
    }
  }

  async createOrganization(data: {
    name: string;
    address?: string;
    phone?: string[];
    [key: string]: any;
  }): Promise<PipedriveApiResponse> {
    return this.post('/organizations', data);
  }

  async updateOrganization(orgId: number, data: Record<string, any>): Promise<PipedriveApiResponse> {
    return this.put(`/organizations/${orgId}`, data);
  }

  async deleteOrganization(orgId: number): Promise<PipedriveApiResponse> {
    return this.delete(`/organizations/${orgId}`);
  }

  async searchOrganizations(params: {
    term: string;
    fields?: string[];
    exact_match?: boolean;
  }): Promise<PipedriveApiResponse> {
    const queryParams: Record<string, any> = {
      term: params.term,
      exact_match: params.exact_match ? 1 : 0,
    };
    if (params.fields && params.fields.length > 0) {
      queryParams.fields = params.fields.join(',');
    }
    return this.get('/organizations/search', queryParams);
  }

  async getOrganizationDeals(orgId: number): Promise<PipedriveApiResponse> {
    return this.get(`/organizations/${orgId}/deals`);
  }

  async getOrganizationPersons(orgId: number): Promise<PipedriveApiResponse> {
    return this.get(`/organizations/${orgId}/persons`);
  }

  async getOrganizationActivities(orgId: number): Promise<PipedriveApiResponse> {
    return this.get(`/organizations/${orgId}/activities`);
  }

  // ==================== ACTIVITY OPERATIONS ====================

  async getActivity(activityId: number): Promise<PipedriveApiResponse> {
    return this.get(`/activities/${activityId}`);
  }

  async listActivities(params?: {
    userId?: number;
    dealId?: number;
    personId?: number;
    orgId?: number;
    type?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    start?: number;
  }): Promise<PipedriveApiResponse> {
    const queryParams: Record<string, any> = {};
    if (params?.userId) queryParams.user_id = params.userId;
    if (params?.dealId) queryParams.deal_id = params.dealId;
    if (params?.personId) queryParams.person_id = params.personId;
    if (params?.orgId) queryParams.org_id = params.orgId;
    if (params?.type) queryParams.type = params.type;
    if (params?.startDate) queryParams.start_date = params.startDate;
    if (params?.endDate) queryParams.end_date = params.endDate;

    const { limit, ...restParams } = params || {};
    
    if (limit && limit > 0) {
      const activities = await this.fetchAllPages('/activities', { ...restParams, ...queryParams }, limit);
      return { success: true, data: activities };
    } else {
      const activities = await this.fetchAllPages('/activities', { ...restParams, ...queryParams });
      return { success: true, data: activities };
    }
  }

  async createActivity(data: {
    subject: string;
    due_date: string;
    type?: string;
    deal_id?: number;
    person_id?: number;
    org_id?: number;
    note?: string;
    [key: string]: any;
  }): Promise<PipedriveApiResponse> {
    return this.post('/activities', data);
  }

  async updateActivity(activityId: number, data: Record<string, any>): Promise<PipedriveApiResponse> {
    return this.put(`/activities/${activityId}`, data);
  }

  async deleteActivity(activityId: number): Promise<PipedriveApiResponse> {
    return this.delete(`/activities/${activityId}`);
  }

  // ==================== NOTE OPERATIONS ====================

  async getNote(noteId: number): Promise<PipedriveApiResponse> {
    return this.get(`/notes/${noteId}`);
  }

  async listNotes(params?: {
    dealId?: number;
    personId?: number;
    orgId?: number;
    limit?: number;
    start?: number;
  }): Promise<PipedriveApiResponse> {
    const queryParams: Record<string, any> = {};
    if (params?.dealId) queryParams.deal_id = params.dealId;
    if (params?.personId) queryParams.person_id = params.personId;
    if (params?.orgId) queryParams.org_id = params.orgId;

    const { limit, ...restParams } = params || {};
    
    if (limit && limit > 0) {
      const notes = await this.fetchAllPages('/notes', { ...restParams, ...queryParams }, limit);
      return { success: true, data: notes };
    } else {
      const notes = await this.fetchAllPages('/notes', { ...restParams, ...queryParams });
      return { success: true, data: notes };
    }
  }

  async createNote(data: {
    content: string;
    deal_id?: number;
    person_id?: number;
    org_id?: number;
    pinned_to_deal_flag?: boolean;
    [key: string]: any;
  }): Promise<PipedriveApiResponse> {
    return this.post('/notes', data);
  }

  async updateNote(noteId: number, data: { content: string; [key: string]: any }): Promise<PipedriveApiResponse> {
    return this.put(`/notes/${noteId}`, data);
  }

  async deleteNote(noteId: number): Promise<PipedriveApiResponse> {
    return this.delete(`/notes/${noteId}`);
  }

  // ==================== PIPELINE OPERATIONS ====================

  async listPipelines(): Promise<PipedriveApiResponse> {
    return this.get('/pipelines');
  }

  async getPipeline(pipelineId: number): Promise<PipedriveApiResponse> {
    return this.get(`/pipelines/${pipelineId}`);
  }

  async getPipelineStages(pipelineId: number): Promise<PipedriveApiResponse> {
    return this.get(`/pipelines/${pipelineId}/stages`);
  }

  // ==================== STAGE OPERATIONS ====================

  async listStages(params?: { pipelineId?: number }): Promise<PipedriveApiResponse> {
    const queryParams: Record<string, any> = {};
    if (params?.pipelineId) queryParams.pipeline_id = params.pipelineId;
    return this.get('/stages', queryParams);
  }

  async getStage(stageId: number): Promise<PipedriveApiResponse> {
    return this.get(`/stages/${stageId}`);
  }

  async updateStage(stageId: number, data: {
    name?: string;
    deal_probability?: number;
    [key: string]: any;
  }): Promise<PipedriveApiResponse> {
    return this.put(`/stages/${stageId}`, data);
  }

  // ==================== PRODUCT OPERATIONS ====================

  async getProduct(productId: number): Promise<PipedriveApiResponse> {
    return this.get(`/products/${productId}`);
  }

  async listProducts(params?: {
    filterId?: number;
    limit?: number;
    start?: number;
  }): Promise<PipedriveApiResponse> {
    const { limit, ...queryParams } = params || {};
    
    if (limit && limit > 0) {
      const products = await this.fetchAllPages('/products', queryParams, limit);
      return { success: true, data: products };
    } else {
      const products = await this.fetchAllPages('/products', queryParams);
      return { success: true, data: products };
    }
  }

  async createProduct(data: {
    name: string;
    code: string;
    unit?: string;
    tax?: number;
    prices?: Array<{ price: number; currency: string }>;
    [key: string]: any;
  }): Promise<PipedriveApiResponse> {
    return this.post('/products', data);
  }

  async updateProduct(productId: number, data: Record<string, any>): Promise<PipedriveApiResponse> {
    return this.put(`/products/${productId}`, data);
  }

  async deleteProduct(productId: number): Promise<PipedriveApiResponse> {
    return this.delete(`/products/${productId}`);
  }

  async searchProducts(params: {
    term: string;
    fields?: string[];
    exact_match?: boolean;
  }): Promise<PipedriveApiResponse> {
    const queryParams: Record<string, any> = {
      term: params.term,
      exact_match: params.exact_match ? 1 : 0,
    };
    if (params.fields && params.fields.length > 0) {
      queryParams.fields = params.fields.join(',');
    }
    return this.get('/products/search', queryParams);
  }

  // ==================== LEAD OPERATIONS ====================

  async getLead(leadId: number): Promise<PipedriveApiResponse> {
    return this.get(`/leads/${leadId}`);
  }

  async listLeads(params?: {
    personId?: number;
    organizationId?: number;
    status?: string;
    limit?: number;
    start?: number;
  }): Promise<PipedriveApiResponse> {
    const queryParams: Record<string, any> = {};
    if (params?.personId) queryParams.person_id = params.personId;
    if (params?.organizationId) queryParams.organization_id = params.organizationId;
    if (params?.status) queryParams.status = params.status;

    const { limit, ...restParams } = params || {};
    
    if (limit && limit > 0) {
      const leads = await this.fetchAllPages('/leads', { ...restParams, ...queryParams }, limit);
      return { success: true, data: leads };
    } else {
      const leads = await this.fetchAllPages('/leads', { ...restParams, ...queryParams });
      return { success: true, data: leads };
    }
  }

  async createLead(data: {
    title: string;
    person_id?: number;
    organization_id?: number;
    value?: number;
    expected_close_date?: string;
    [key: string]: any;
  }): Promise<PipedriveApiResponse> {
    return this.post('/leads', data);
  }

  async updateLead(leadId: number, data: Record<string, any>): Promise<PipedriveApiResponse> {
    return this.put(`/leads/${leadId}`, data);
  }

  async deleteLead(leadId: number): Promise<PipedriveApiResponse> {
    return this.delete(`/leads/${leadId}`);
  }

  // ==================== FILE OPERATIONS ====================

  async listFiles(params?: {
    dealId?: number;
    personId?: number;
    orgId?: number;
    activityId?: number;
  }): Promise<PipedriveApiResponse> {
    const queryParams: Record<string, any> = {};
    if (params?.dealId) queryParams.deal_id = params.dealId;
    if (params?.personId) queryParams.person_id = params.personId;
    if (params?.orgId) queryParams.org_id = params.orgId;
    if (params?.activityId) queryParams.activity_id = params.activityId;
    return this.get('/files', queryParams);
  }

  async uploadFile(
    fileData: string | Buffer,
    fileName: string,
    associations: {
      dealId?: number;
      personId?: number;
      orgId?: number;
      activityId?: number;
    }
  ): Promise<PipedriveApiResponse> {
    // Pipedrive file upload requires multipart/form-data
    const form = new FormData();

    // Add file
    if (typeof fileData === 'string') {
      // If it's a URL, download it first
      if (fileData.startsWith('http://') || fileData.startsWith('https://')) {
        const fileResponse = await axios.get(fileData, { responseType: 'arraybuffer' });
        form.append('file', Buffer.from(fileResponse.data), fileName);
      } else {
        // Assume it's base64
        const base64Data = fileData.replace(/^data:.*,/, '');
        form.append('file', Buffer.from(base64Data, 'base64'), fileName);
      }
    } else {
      form.append('file', fileData, fileName);
    }

    // Add associations
    if (associations.dealId) form.append('deal_id', associations.dealId.toString());
    if (associations.personId) form.append('person_id', associations.personId.toString());
    if (associations.orgId) form.append('org_id', associations.orgId.toString());
    if (associations.activityId) form.append('activity_id', associations.activityId.toString());

    try {
      const response = await this.axiosInstance.post('/files', form, {
        headers: form.getHeaders(),
        params: { api_token: this.apiToken }
      });
      return response.data as PipedriveApiResponse;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async downloadFile(fileId: string): Promise<PipedriveApiResponse> {
    return this.get(`/files/${fileId}/download`);
  }

  async deleteFile(fileId: string): Promise<PipedriveApiResponse> {
    return this.delete(`/files/${fileId}`);
  }

  // ==================== WEBHOOK OPERATIONS ====================

  async listWebhooks(): Promise<PipedriveApiResponse> {
    return this.get('/webhooks');
  }

  async createWebhook(data: {
    event: string;
    subscription_url: string;
  }): Promise<PipedriveApiResponse> {
    return this.post('/webhooks', data);
  }

  async deleteWebhook(webhookId: number): Promise<PipedriveApiResponse> {
    return this.delete(`/webhooks/${webhookId}`);
  }
}
