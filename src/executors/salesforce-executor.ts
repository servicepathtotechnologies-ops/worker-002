import { salesforceTokenManager } from '../services/salesforce/salesforce-token-manager';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SalesforceExecutorConfig {
  resource: string;
  operation: string;
  recordId?: string;
  soqlQuery?: string;
  soslQuery?: string;
  customObject?: string;
  returnAll?: boolean;
  limit?: number;
  apiVersion?: string;
  additionalFields?: Record<string, unknown>;
  // resource-specific fields
  lastName?: string;
  company?: string;
  subject?: string;
  name?: string;
  stageName?: string;
  closeDate?: string;
  title?: string;
  parentId?: string;
  startDateTime?: string;
  endDateTime?: string;
  accountId?: string;
  contractTerm?: string | number;
  firstName?: string;
  email?: string;
  phone?: string;
  website?: string;
  description?: string;
  status?: string;
  priority?: string;
  activityDate?: string;
  body?: string;
  [key: string]: unknown;
}

export interface SalesforceExecutorContext {
  userId: string;
  config: SalesforceExecutorConfig;
}

// ─── Error Class ─────────────────────────────────────────────────────────────

export class SalesforceApiError extends Error {
  statusCode: number;
  errorCode: string;
  duplicateId?: string;

  constructor(params: {
    message: string;
    statusCode: number;
    errorCode: string;
    duplicateId?: string;
  }) {
    super(params.message);
    this.name = 'SalesforceApiError';
    this.statusCode = params.statusCode;
    this.errorCode = params.errorCode;
    this.duplicateId = params.duplicateId;
  }
}

// ─── Maps ─────────────────────────────────────────────────────────────────────

const RESOURCE_TO_SOBJECT: Record<string, string> = {
  account: 'Account',
  contact: 'Contact',
  lead: 'Lead',
  opportunity: 'Opportunity',
  case: 'Case',
  task: 'Task',
  note: 'Note',
  campaign: 'Campaign',
  event: 'Event',
  contract: 'Contract',
  product: 'Product2',
  user: 'User',
};

const OPERATION_TO_HTTP: Record<string, string> = {
  create: 'POST',
  get: 'GET',
  update: 'PATCH',
  delete: 'DELETE',
  search: 'GET',
  query: 'GET',
  sosl: 'GET',
  convert: 'POST',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function parseSalesforceError(
  response: Response,
  userId: string,
  resource: string,
  operation: string,
): Promise<never> {
  let errors: Array<{ message: string; errorCode: string }> = [];
  try {
    const body = await response.json();
    errors = Array.isArray(body) ? body : [body];
  } catch {
    errors = [{ message: response.statusText, errorCode: 'UNKNOWN_ERROR' }];
  }

  const first = errors[0] ?? { message: 'Unknown error', errorCode: 'UNKNOWN_ERROR' };

  let duplicateId: string | undefined;
  if (first.errorCode === 'DUPLICATE_VALUE') {
    const match = first.message.match(/id: ([a-zA-Z0-9]{15,18})/);
    duplicateId = match?.[1];
  }

  console.error('[SalesforceExecutor] API error', {
    userId,
    resource,
    operation,
    statusCode: response.status,
    errorCode: first.errorCode,
  });

  throw new SalesforceApiError({
    message: first.message,
    statusCode: response.status,
    errorCode: first.errorCode,
    duplicateId,
  });
}

async function fetchWithPagination(
  url: string,
  accessToken: string,
  returnAll: boolean,
  limit: number,
  instanceUrl: string,
): Promise<{ records: unknown[]; totalSize: number; done: boolean }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    // Re-throw as a generic error here; caller handles structured errors
    const text = await response.text();
    throw new Error(`Salesforce query failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    records: unknown[];
    totalSize: number;
    done: boolean;
    nextRecordsUrl?: string;
  };

  const records: unknown[] = [...(data.records ?? [])];

  if (!returnAll) {
    return {
      records: records.slice(0, limit),
      totalSize: data.totalSize,
      done: data.done,
    };
  }

  // Follow pagination until done
  let currentData = data;
  while (!currentData.done && currentData.nextRecordsUrl) {
    const nextUrl = currentData.nextRecordsUrl.startsWith('http')
      ? currentData.nextRecordsUrl
      : `${instanceUrl}${currentData.nextRecordsUrl}`;

    const nextResponse = await fetch(nextUrl, { method: 'GET', headers });
    if (!nextResponse.ok) {
      break;
    }
    currentData = (await nextResponse.json()) as typeof data;
    records.push(...(currentData.records ?? []));
  }

  return { records, totalSize: data.totalSize, done: true };
}

function buildResourceBody(
  resource: string,
  config: SalesforceExecutorConfig,
): Record<string, unknown> {
  let body: Record<string, unknown> = {};

  switch (resource) {
    case 'account':
      body = {
        Name: config.name,
        Phone: config.phone,
        Website: config.website,
        Description: config.description,
        BillingCity: config.billingCity,
        BillingState: config.billingState,
        BillingCountry: config.billingCountry,
        Industry: config.industry,
        Type: config.type,
        AnnualRevenue: config.annualRevenue,
        NumberOfEmployees: config.numberOfEmployees,
      };
      break;

    case 'contact':
      body = {
        LastName: config.lastName,
        FirstName: config.firstName,
        Email: config.email,
        Phone: config.phone,
        Title: config.title,
        AccountId: config.accountId,
        Department: config.department,
        MailingCity: config.mailingCity,
        MailingState: config.mailingState,
        MailingCountry: config.mailingCountry,
      };
      break;

    case 'lead':
      body = {
        LastName: config.lastName,
        FirstName: config.firstName,
        Company: config.company,
        Email: config.email,
        Phone: config.phone,
        Title: config.title,
        Status: config.status,
        LeadSource: config.leadSource,
        Industry: config.industry,
        AnnualRevenue: config.annualRevenue,
        NumberOfEmployees: config.numberOfEmployees,
        Website: config.website,
        Description: config.description,
      };
      break;

    case 'opportunity':
      body = {
        Name: config.name,
        StageName: config.stageName,
        CloseDate: config.closeDate,
        AccountId: config.accountId,
        Amount: config.amount,
        Probability: config.probability,
        Description: config.description,
        Type: config.type,
        LeadSource: config.leadSource,
      };
      break;

    case 'case':
      body = {
        Subject: config.subject,
        Description: config.description,
        Status: config.status,
        Priority: config.priority,
        AccountId: config.accountId,
        ContactId: config.contactId,
        Origin: config.origin,
        Type: config.type,
      };
      break;

    case 'task':
      body = {
        Subject: config.subject,
        Status: config.status,
        Priority: config.priority,
        ActivityDate: config.activityDate,
        WhoId: config.whoId,
        WhatId: config.whatId,
        Description: config.description,
      };
      break;

    case 'note':
      body = {
        Title: config.title,
        Body: config.body,
        ParentId: config.parentId,
        IsPrivate: config.isPrivate,
      };
      break;

    case 'campaign':
      body = {
        Name: config.name,
        Status: config.status,
        Type: config.type,
        StartDate: config.startDate,
        EndDate: config.endDate,
        Description: config.description,
        IsActive: config.isActive,
        BudgetedCost: config.budgetedCost,
        ActualCost: config.actualCost,
      };
      break;

    case 'event':
      body = {
        Subject: config.subject,
        StartDateTime: config.startDateTime,
        EndDateTime: config.endDateTime,
        WhoId: config.whoId,
        WhatId: config.whatId,
        Description: config.description,
        Location: config.location,
        IsAllDayEvent: config.isAllDayEvent,
      };
      break;

    case 'contract':
      body = {
        AccountId: config.accountId,
        ContractTerm: config.contractTerm,
        StartDate: config.startDate,
        Status: config.status,
        Description: config.description,
      };
      break;

    case 'product':
      body = {
        Name: config.name,
        ProductCode: config.productCode,
        Description: config.description,
        IsActive: config.isActive,
        Family: config.family,
      };
      break;

    case 'user':
      body = {
        FirstName: config.firstName,
        LastName: config.lastName,
        Email: config.email,
        Title: config.title,
        Department: config.department,
        Phone: config.phone,
      };
      break;

    case 'custom':
      // custom uses additionalFields only
      return { ...(config.additionalFields ?? {}) };

    default:
      body = {};
  }

  // Remove undefined and empty string values (keep 0 and false)
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== '') {
      cleaned[key] = value;
    }
  }

  // Merge with additionalFields
  return { ...cleaned, ...(config.additionalFields ?? {}) };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateRequiredFields(config: SalesforceExecutorConfig): void {
  const { resource, operation } = config;
  const missing: string[] = [];

  // Operations that require recordId
  if (['get', 'update', 'delete', 'convert'].includes(operation)) {
    if (!config.recordId) missing.push('recordId');
  }

  // Resource + create validations
  if (operation === 'create') {
    if (resource === 'contact' || resource === 'lead') {
      if (!config.lastName) missing.push('lastName');
    }
    if (resource === 'lead') {
      if (!config.company) missing.push('company');
    }
    if (resource === 'opportunity') {
      if (!config.name) missing.push('name');
      if (!config.stageName) missing.push('stageName');
      if (!config.closeDate) missing.push('closeDate');
    }
    if (resource === 'case') {
      if (!config.subject) missing.push('subject');
    }
    if (resource === 'task') {
      if (!config.subject) missing.push('subject');
    }
    if (resource === 'note') {
      if (!config.title) missing.push('title');
      if (!config.parentId) missing.push('parentId');
    }
    if (resource === 'campaign') {
      if (!config.name) missing.push('name');
    }
    if (resource === 'event') {
      if (!config.subject) missing.push('subject');
      if (!config.startDateTime) missing.push('startDateTime');
      if (!config.endDateTime) missing.push('endDateTime');
    }
    if (resource === 'contract') {
      if (!config.accountId) missing.push('accountId');
      if (config.contractTerm === undefined || config.contractTerm === '') missing.push('contractTerm');
    }
    if (resource === 'product') {
      if (!config.name) missing.push('name');
    }
  }

  // Custom resource requires customObject
  if (resource === 'custom') {
    if (!config.customObject) missing.push('customObject');
  }

  // Query/SOSL operations
  if (operation === 'query') {
    if (!config.soqlQuery) missing.push('soqlQuery');
  }
  if (operation === 'sosl') {
    if (!config.soslQuery) missing.push('soslQuery');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

// ─── Main Executor ────────────────────────────────────────────────────────────

async function executeSalesforceNode(
  context: SalesforceExecutorContext,
): Promise<Record<string, unknown>> {
  const { userId, config } = context;
  const { resource, operation } = config;

  // Step 1: Get token
  const token = await salesforceTokenManager.getToken(userId);
  if (!token) {
    throw new Error('Salesforce token expired. Please reconnect your Salesforce account.');
  }

  // Step 2: Validate required fields before any fetch
  validateRequiredFields(config);

  // Step 3: Build base URL
  const apiVersion = config.apiVersion ?? 'v59.0';
  const baseUrl = `${token.instanceUrl}/services/data/${apiVersion}`;

  // Step 4: Determine sObject name
  const sObject =
    resource === 'custom' ? config.customObject! : RESOURCE_TO_SOBJECT[resource];

  const authHeaders = {
    Authorization: `Bearer ${token.accessToken}`,
    'Content-Type': 'application/json',
  };

  // Step 5: Execute operation
  switch (operation) {
    case 'query': {
      const url = `${baseUrl}/query?q=${encodeURIComponent(config.soqlQuery!)}`;
      return fetchWithPagination(
        url,
        token.accessToken,
        config.returnAll ?? false,
        config.limit ?? 50,
        token.instanceUrl,
      );
    }

    case 'sosl': {
      const url = `${baseUrl}/search?q=${encodeURIComponent(config.soslQuery!)}`;
      const response = await fetch(url, { method: 'GET', headers: authHeaders });
      if (!response.ok) {
        return parseSalesforceError(response, userId, resource, operation);
      }
      const data = (await response.json()) as { searchRecords?: unknown[] };
      return {
        records: data.searchRecords ?? [],
        totalSize: data.searchRecords?.length ?? 0,
        done: true,
      };
    }

    case 'search': {
      const searchTerm = (config.searchTerm as string) ?? '';
      const soql = `SELECT Id, Name FROM ${sObject} WHERE Name LIKE '%${searchTerm}%' LIMIT ${config.limit ?? 50}`;
      const url = `${baseUrl}/query?q=${encodeURIComponent(soql)}`;
      return fetchWithPagination(
        url,
        token.accessToken,
        config.returnAll ?? false,
        config.limit ?? 50,
        token.instanceUrl,
      );
    }

    case 'get': {
      const url = `${baseUrl}/sobjects/${sObject}/${config.recordId}`;
      const response = await fetch(url, { method: 'GET', headers: authHeaders });
      if (!response.ok) {
        return parseSalesforceError(response, userId, resource, operation);
      }
      const data = (await response.json()) as { Id?: string };
      return { id: data.Id, success: true, record: data };
    }

    case 'create': {
      const body = buildResourceBody(resource, config);
      const url = `${baseUrl}/sobjects/${sObject}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return parseSalesforceError(response, userId, resource, operation);
      }
      const data = (await response.json()) as { id?: string; success?: boolean };
      return { id: data.id, success: data.success, record: data };
    }

    case 'update': {
      const body = buildResourceBody(resource, config);
      const url = `${baseUrl}/sobjects/${sObject}/${config.recordId}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return parseSalesforceError(response, userId, resource, operation);
      }
      // Salesforce PATCH returns 204 No Content on success
      return { id: config.recordId, success: true };
    }

    case 'delete': {
      const url = `${baseUrl}/sobjects/${sObject}/${config.recordId}`;
      const response = await fetch(url, { method: 'DELETE', headers: authHeaders });
      if (!response.ok) {
        return parseSalesforceError(response, userId, resource, operation);
      }
      // Salesforce DELETE returns 204 No Content on success
      return { id: config.recordId, success: true };
    }

    case 'convert': {
      // Lead convert via Invocable Actions
      const url = `${baseUrl}/actions/standard/convertLead`;
      const body = {
        inputs: [
          {
            leadId: config.recordId,
            convertedStatus: (config.convertedStatus as string) ?? 'Closed - Converted',
            doCreateOpportunity: true,
          },
        ],
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return parseSalesforceError(response, userId, resource, operation);
      }
      const data = await response.json();
      return data as Record<string, unknown>;
    }

    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }
}

export { executeSalesforceNode };
export { RESOURCE_TO_SOBJECT, OPERATION_TO_HTTP };
