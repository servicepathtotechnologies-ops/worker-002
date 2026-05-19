/**
 * ✅ WHATSAPP NODE - Registry Override
 *
 * WhatsApp Business API integration.
 * Delegates execution to the social dispatcher with provider: 'whatsapp'.
 */

import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeSocialNode } from '../../../services/social/social-dispatcher';

export function overrideWhatsapp(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {
  const operationOptions = [
    'sendText',
    'sendMedia',
    'sendLocation',
    'sendContact',
    'sendTemplate',
    'sendInteractiveButtons',
    'sendInteractiveList',
    'sendInteractiveCTA',
    'markAsRead',
  ].map((value) => ({
    label: value.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    value,
  }));

  const buildtime = {
    default: 'buildtime_ai_once' as const,
    supportsRuntimeAI: true,
    supportsBuildtimeAI: true,
  };
  const structuralBuildtime = {
    default: 'buildtime_ai_once' as const,
    supportsRuntimeAI: false,
    supportsBuildtimeAI: true,
  };
  const manualStatic = {
    default: 'manual_static' as const,
    supportsRuntimeAI: false,
    supportsBuildtimeAI: false,
  };
  const field = (
    base: Record<string, unknown>,
    fillMode: typeof buildtime | typeof structuralBuildtime | typeof manualStatic,
    role?: string,
    ownership: 'structural' | 'value' | 'credential' = 'value',
  ): any => ({
    ...base,
    ownership,
    fillMode,
    ...(role ? { role } : {}),
  });

  return {
    ...def,
    type: 'whatsapp',
    label: 'WhatsApp',
    category: 'output',
    description: 'Send messages, manage contacts and conversations via WhatsApp Business API',
    icon: '💬',
    version: '1.0.0',
    isBranching: false,
    incomingPorts: ['default'],
    outgoingPorts: ['default'],
    credentialSchema: {
      requirements: [
        {
          provider: 'facebook',
          category: 'oauth',
          required: true,
          description: 'Facebook OAuth token with WhatsApp Business permissions',
          scopes: ['whatsapp_business_messaging', 'whatsapp_business_management'],
        },
      ],
    },
    inputSchema: {
      resource: field({ type: 'string', description: 'WhatsApp resource', required: true, default: 'message', examples: ['message', 'contact', 'conversation', 'template', 'campaign', 'aiAgent'] }, structuralBuildtime, 'config', 'structural'),
      operation: field({ type: 'string', description: 'WhatsApp operation', required: true, default: 'sendText', examples: operationOptions.map((option) => option.value), ui: { options: operationOptions } }, structuralBuildtime, 'config', 'structural'),
      phoneNumberId: field({ type: 'string', description: 'WhatsApp Phone Number ID (auto-resolved if absent)', required: false }, manualStatic, 'id'),
      businessAccountId: field({ type: 'string', description: 'WhatsApp Business Account ID (auto-resolved if absent)', required: false }, manualStatic, 'id'),
      to: field({ type: 'string', description: 'Recipient phone number in E.164 format', required: false }, buildtime, 'recipient'),
      text: field({ type: 'string', description: 'Message text', required: false }, buildtime, 'long_body'),
      previewUrl: field({ type: 'boolean', description: 'Enable URL preview in text messages', required: false, default: false }, buildtime),
      mediaType: field({ type: 'string', description: 'Media type', required: false, examples: ['image', 'video', 'audio', 'document', 'sticker'] }, buildtime, 'config'),
      mediaUrl: field({ type: 'string', description: 'Media URL', required: false }, buildtime, 'config'),
      mediaId: field({ type: 'string', description: 'Media ID (alternative to mediaUrl)', required: false }, buildtime, 'id'),
      caption: field({ type: 'string', description: 'Media caption', required: false }, buildtime, 'long_body'),
      latitude: field({ type: 'number', description: 'Location latitude', required: false }, buildtime),
      longitude: field({ type: 'number', description: 'Location longitude', required: false }, buildtime),
      locationName: field({ type: 'string', description: 'Location name', required: false }, buildtime, 'short_summary'),
      address: field({ type: 'string', description: 'Location address', required: false }, buildtime, 'long_body'),
      contacts: field({ type: 'array', description: 'Contact objects for sendContact', required: false }, buildtime, 'raw_json'),
      templateName: field({ type: 'string', description: 'Template name', required: false }, buildtime, 'short_summary'),
      language: field({ type: 'string', description: 'Template language code (e.g. en_US)', required: false }, buildtime, 'config'),
      templateComponents: field({ type: 'array', description: 'Template components', required: false }, buildtime, 'raw_json'),
      templateCategory: field({ type: 'string', description: 'Template category', required: false, examples: ['MARKETING', 'UTILITY', 'AUTHENTICATION'] }, buildtime, 'config'),
      templateStatus: field({ type: 'string', description: 'Template approval status (must be APPROVED to send)', required: false }, buildtime, 'config'),
      bodyText: field({ type: 'string', description: 'Interactive message body text', required: false }, buildtime, 'long_body'),
      headerText: field({ type: 'string', description: 'Interactive message header text', required: false }, buildtime, 'short_summary'),
      footerText: field({ type: 'string', description: 'Interactive message footer text', required: false }, buildtime, 'short_summary'),
      buttons: field({ type: 'array', description: 'Interactive buttons', required: false }, buildtime, 'raw_json'),
      buttonText: field({ type: 'string', description: 'List button text', required: false }, buildtime, 'short_summary'),
      sections: field({ type: 'array', description: 'List sections', required: false }, buildtime, 'raw_json'),
      ctaUrl: field({ type: 'object', description: 'CTA URL object { display_text, url }', required: false }, buildtime, 'raw_json'),
      messageId: field({ type: 'string', description: 'Message ID (for markAsRead)', required: false }, buildtime, 'id'),
      contactId: field({ type: 'string', description: 'Contact ID', required: false }, buildtime, 'id'),
      contactName: field({ type: 'string', description: 'Contact name', required: false }, buildtime, 'short_summary'),
      contactPhone: field({ type: 'string', description: 'Contact phone', required: false }, buildtime, 'recipient'),
      contactEmail: field({ type: 'string', description: 'Contact email', required: false }, buildtime, 'recipient'),
      labels: field({ type: 'array', description: 'Contact labels', required: false }, buildtime, 'raw_json'),
      conversationId: field({ type: 'string', description: 'Conversation ID', required: false }, buildtime, 'id'),
      recipients: field({ type: 'array', description: 'Campaign recipients (array of phone numbers)', required: false }, buildtime, 'raw_json'),
      limit: field({ type: 'number', description: 'Pagination limit', required: false, default: 20 }, buildtime),
      after: field({ type: 'string', description: 'Pagination cursor', required: false }, manualStatic, 'id'),
      returnAll: field({ type: 'boolean', description: 'Return all results (ignores limit)', required: false, default: false }, buildtime),
    },
    outputSchema: {
      default: {
        name: 'default',
        description: 'WhatsApp operation result',
        schema: {
          type: 'object',
          properties: {
            messageId: { type: 'string' },
            data: { type: 'object' },
            error: { type: 'object' },
          },
        },
      },
    },
    requiredInputs: ['resource', 'operation'],
    defaultConfig: () => ({
      resource: 'message',
      operation: 'sendText',
      previewUrl: false,
      returnAll: false,
      limit: 20,
    }),
    validateConfig: (config) => {
      const errors: string[] = [];
      if (!config.resource) errors.push('resource is required');
      if (!config.operation) errors.push('operation is required');
      return { valid: errors.length === 0, errors };
    },
    execute: async (context) => {
      try {
        const { db, userId, currentUserId, config } = context;
        const result = await executeSocialNode(db, { provider: 'whatsapp', operation: config.operation ?? 'sendText', ...config }, userId, currentUserId);
        return {
          success: result.success,
          output: result.data,
          error: result.error ? { code: 'WHATSAPP_ERROR', message: result.error } : undefined,
        };
      } catch (err: any) {
        return {
          success: false,
          error: { code: 'WHATSAPP_ERROR', message: err?.message ?? String(err) },
        };
      }
    },
  };
}
