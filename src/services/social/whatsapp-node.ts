/**
 * WhatsApp Node Executor
 *
 * Implements all WhatsApp Cloud API operations via the Meta Graph API v18.0.
 * Routing is driven by params.resource / params.operation — no hardcoded node.type checks.
 */

import { MetaApiError } from './types';
import { readAcknowledgedHttpResponse } from '../../core/http/acknowledged-response';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface WhatsAppNodeParams {
  resource: 'message' | 'contact' | 'conversation' | 'template' | 'campaign' | 'aiAgent';
  operation: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  // message fields
  to?: string;
  text?: string;
  previewUrl?: boolean;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  mediaUrl?: string;
  mediaId?: string;
  caption?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  address?: string;
  contacts?: Record<string, any>[];
  templateName?: string;
  language?: string;
  templateComponents?: Record<string, any>[];
  templateCategory?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  templateStatus?: string;
  bodyText?: string;
  headerText?: string;
  footerText?: string;
  buttons?: Record<string, any>[];
  buttonText?: string;
  sections?: Record<string, any>[];
  ctaUrl?: { display_text: string; url: string };
  messageId?: string;
  // contact fields
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  labels?: string[];
  // conversation fields
  conversationId?: string;
  // campaign fields
  recipients?: string[];
  // pagination
  limit?: number;
  after?: string;
  returnAll?: boolean;
}

export interface WhatsAppNodeResult {
  success: boolean;
  resource: string;
  operation: string;
  data: Record<string, any>;
  error: MetaApiError | null;
  meta: { executionTimeMs: number; apiCallCount: number };
}

// ─── WhatsAppNode class ───────────────────────────────────────────────────────

export class WhatsAppNode {
  private apiCallCount = 0;
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private readonly accessToken: string,
    private readonly db: any,
  ) {}

  // ── Public entry point ────────────────────────────────────────────────────

  async execute(params: WhatsAppNodeParams): Promise<WhatsAppNodeResult> {
    const startedAt = Date.now();
    this.apiCallCount = 0;

    try {
      const data = await this.dispatch(params);
      const executionTimeMs = Date.now() - startedAt;
      console.log(
        `[WhatsAppNode] ${params.resource}.${params.operation} completed in ${executionTimeMs}ms, apiCalls=${this.apiCallCount}`,
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
        `[WhatsAppNode] ${params.resource}.${params.operation} failed in ${executionTimeMs}ms, apiCalls=${this.apiCallCount}`,
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

  private async dispatch(params: WhatsAppNodeParams): Promise<Record<string, any>> {
    switch (params.resource) {
      case 'message':
        return this.handleMessage(params);
      case 'contact':
        return this.handleContact(params);
      case 'conversation':
        return this.handleConversation(params);
      case 'template':
        return this.handleTemplate(params);
      case 'campaign':
        return this.handleCampaign(params);
      case 'aiAgent':
        return this.handleAiAgent(params);
      default:
        throw new Error(`Unknown resource: ${(params as any).resource}`);
    }
  }

  // ── message resource ──────────────────────────────────────────────────────

  private async handleMessage(params: WhatsAppNodeParams): Promise<Record<string, any>> {
    const phoneNumberId = await this.resolvePhoneNumberId(params);

    switch (params.operation) {
      case 'sendText': {
        return this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'text',
          text: { body: params.text, preview_url: params.previewUrl },
        });
      }

      case 'sendMedia': {
        const mediaType = params.mediaType ?? 'image';
        const mediaPayload = params.mediaId
          ? { id: params.mediaId, caption: params.caption }
          : { link: params.mediaUrl, caption: params.caption };
        return this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
          messaging_product: 'whatsapp',
          to: params.to,
          type: mediaType,
          [mediaType]: mediaPayload,
        });
      }

      case 'sendLocation': {
        return this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'location',
          location: {
            latitude: params.latitude,
            longitude: params.longitude,
            name: params.locationName,
            address: params.address,
          },
        });
      }

      case 'sendContact': {
        return this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'contacts',
          contacts: params.contacts,
        });
      }

      case 'sendTemplate': {
        this.assertTemplateApproved(params);
        return this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'template',
          template: {
            name: params.templateName,
            language: { code: params.language },
            components: params.templateComponents ?? [],
          },
        });
      }

      case 'sendInteractiveButtons': {
        const interactive: Record<string, any> = {
          type: 'button',
          body: { text: params.bodyText },
          action: { buttons: params.buttons },
        };
        if (params.headerText) {
          interactive.header = { type: 'text', text: params.headerText };
        }
        if (params.footerText) {
          interactive.footer = { text: params.footerText };
        }
        return this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'interactive',
          interactive,
        });
      }

      case 'sendInteractiveList': {
        return this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: params.bodyText },
            action: { button: params.buttonText, sections: params.sections },
          },
        });
      }

      case 'sendInteractiveCTA': {
        return this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            body: { text: params.bodyText },
            action: { name: 'cta_url', parameters: params.ctaUrl },
          },
        });
      }

      case 'markAsRead': {
        return this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: params.messageId,
        });
      }

      default:
        throw new Error(`Unknown message operation: ${params.operation}`);
    }
  }

  // ── contact resource ──────────────────────────────────────────────────────

  private async handleContact(params: WhatsAppNodeParams): Promise<Record<string, any>> {
    const businessAccountId = await this.resolveBusinessAccountId(params);

    switch (params.operation) {
      case 'create': {
        return this.callMetaApi(`/${businessAccountId}/contacts`, 'POST', {
          name: params.contactName,
          phone: params.contactPhone,
          email: params.contactEmail,
        });
      }

      case 'update': {
        const body: Record<string, any> = {};
        if (params.contactName !== undefined) body.name = params.contactName;
        if (params.contactPhone !== undefined) body.phone = params.contactPhone;
        if (params.contactEmail !== undefined) body.email = params.contactEmail;
        return this.callMetaApi(`/${params.contactId}`, 'POST', body);
      }

      case 'delete': {
        return this.callMetaApi(`/${params.contactId}`, 'DELETE');
      }

      case 'search': {
        const search = params.contactPhone ?? params.contactName ?? '';
        return this.callMetaApi(
          `/${businessAccountId}/contacts?search=${encodeURIComponent(search)}&limit=${params.limit ?? 20}`,
          'GET',
        );
      }

      case 'addLabel': {
        return this.callMetaApi(`/${params.contactId}/labels`, 'POST', {
          labels: params.labels,
        });
      }

      case 'removeLabel': {
        return this.callMetaApi(`/${params.contactId}/labels`, 'DELETE', {
          labels: params.labels,
        });
      }

      default:
        throw new Error(`Unknown contact operation: ${params.operation}`);
    }
  }

  // ── conversation resource ─────────────────────────────────────────────────

  private async handleConversation(params: WhatsAppNodeParams): Promise<Record<string, any>> {
    const phoneNumberId = await this.resolvePhoneNumberId(params);

    switch (params.operation) {
      case 'list': {
        const qs = new URLSearchParams();
        if (params.limit) qs.set('limit', String(params.limit));
        if (params.after) qs.set('after', params.after);
        return this.callMetaApi(`/${phoneNumberId}/conversations?${qs.toString()}`, 'GET');
      }

      case 'get': {
        return this.callMetaApi(
          `/${params.conversationId}?fields=id,status,messages,participants`,
          'GET',
        );
      }

      case 'close': {
        return this.callMetaApi(`/${params.conversationId}`, 'POST', { status: 'resolved' });
      }

      case 'archive': {
        return this.callMetaApi(`/${params.conversationId}`, 'POST', { status: 'archived' });
      }

      case 'markAsRead': {
        return this.callMetaApi(`/${params.conversationId}/mark_as_read`, 'POST');
      }

      default:
        throw new Error(`Unknown conversation operation: ${params.operation}`);
    }
  }

  // ── template resource ─────────────────────────────────────────────────────

  private async handleTemplate(params: WhatsAppNodeParams): Promise<Record<string, any>> {
    const businessAccountId = await this.resolveBusinessAccountId(params);

    switch (params.operation) {
      case 'list': {
        return this.callMetaApi(
          `/${businessAccountId}/message_templates?limit=${params.limit ?? 20}`,
          'GET',
        );
      }

      case 'get': {
        return this.callMetaApi(
          `/${businessAccountId}/message_templates?name=${encodeURIComponent(params.templateName ?? '')}`,
          'GET',
        );
      }

      case 'create': {
        return this.callMetaApi(`/${businessAccountId}/message_templates`, 'POST', {
          name: params.templateName,
          language: params.language,
          category: params.templateCategory,
          components: params.templateComponents,
        });
      }

      case 'delete': {
        return this.callMetaApi(
          `/${businessAccountId}/message_templates?name=${encodeURIComponent(params.templateName ?? '')}`,
          'DELETE',
        );
      }

      default:
        throw new Error(`Unknown template operation: ${params.operation}`);
    }
  }

  // ── campaign resource ─────────────────────────────────────────────────────

  private async handleCampaign(params: WhatsAppNodeParams): Promise<Record<string, any>> {
    switch (params.operation) {
      case 'create': {
        this.assertTemplateApproved(params);

        const recipients = params.recipients ?? [];
        const phoneNumberId = await this.resolvePhoneNumberId(params);
        let sent = 0;
        let failed = 0;

        for (const recipient of recipients) {
          try {
            await this.callMetaApi(`/${phoneNumberId}/messages`, 'POST', {
              messaging_product: 'whatsapp',
              to: recipient,
              type: 'template',
              template: {
                name: params.templateName,
                language: { code: params.language },
                components: params.templateComponents ?? [],
              },
            });
            sent++;
          } catch {
            failed++;
          }
        }

        return { sent, failed, total: recipients.length };
      }

      case 'list': {
        const businessAccountId = await this.resolveBusinessAccountId(params);
        return this.callMetaApi(
          `/${businessAccountId}/campaigns?limit=${params.limit ?? 20}`,
          'GET',
        );
      }

      default:
        throw new Error(`Unknown campaign operation: ${params.operation}`);
    }
  }

  // ── aiAgent resource ──────────────────────────────────────────────────────

  private async handleAiAgent(params: WhatsAppNodeParams): Promise<Record<string, any>> {
    switch (params.operation) {
      case 'enable': {
        return this.callMetaApi(`/${params.conversationId}/ai_agent`, 'POST', { enabled: true });
      }

      case 'disable': {
        return this.callMetaApi(`/${params.conversationId}/ai_agent`, 'POST', { enabled: false });
      }

      case 'getSuggestions': {
        return this.callMetaApi(`/${params.conversationId}/ai_suggestions`, 'GET');
      }

      default:
        throw new Error(`Unknown aiAgent operation: ${params.operation}`);
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

    const parsed = await readAcknowledgedHttpResponse(response);
    const json = parsed.data as any;

    if (!response.ok) {
      const err = json?.error ?? {};
      const error = new Error(err.message ?? parsed.rawText ?? `HTTP ${response.status}`);
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
    } else if (code === 131030) {
      const name = error?.errorData?.template_name ?? 'unknown';
      userMessage = `Template '${name}' is not approved for sending.`;
    } else if (code === 368) {
      userMessage = 'Your WhatsApp account has been temporarily blocked. Please try again later.';
    } else {
      userMessage = `Meta API error ${code}: ${message}`;
    }

    return { code, message, fbtrace_id, userMessage };
  }

  private async resolvePhoneNumberId(params: WhatsAppNodeParams): Promise<string> {
    if (params.phoneNumberId) {
      return params.phoneNumberId;
    }
    const result = await this.callMetaApi('/me/phone_numbers', 'GET');
    const first = result?.data?.[0];
    if (!first?.id) {
      throw new Error('Could not resolve phoneNumberId: no phone numbers found on this account.');
    }
    return first.id as string;
  }

  private async resolveBusinessAccountId(params: WhatsAppNodeParams): Promise<string> {
    if (params.businessAccountId) {
      return params.businessAccountId;
    }
    const phoneNumberId = await this.resolvePhoneNumberId(params);
    const result = await this.callMetaApi(
      `/${phoneNumberId}?fields=whatsapp_business_account`,
      'GET',
    );
    const wabaId = result?.whatsapp_business_account?.id;
    if (!wabaId) {
      throw new Error('Could not resolve businessAccountId: WABA not found for this phone number.');
    }
    return wabaId as string;
  }

  private assertTemplateApproved(params: WhatsAppNodeParams): void {
    if (params.templateStatus !== undefined && params.templateStatus !== 'APPROVED') {
      const err = new Error(
        `Template '${params.templateName ?? 'unknown'}' is not approved for sending. Current status: ${params.templateStatus}.`,
      );
      (err as any).code = 131030;
      (err as any).errorData = { template_name: params.templateName ?? 'unknown' };
      throw err;
    }
  }
}
