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
  return {
    ...def,
    type: 'whatsapp',
    label: 'WhatsApp',
    category: 'communication',
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
      resource: { type: 'string', description: 'WhatsApp resource', required: true, default: 'message', examples: ['message', 'contact', 'conversation', 'template', 'campaign', 'aiAgent'] },
      operation: { type: 'string', description: 'WhatsApp operation', required: true, default: 'sendText', examples: ['sendText', 'sendMedia', 'sendLocation', 'sendContact', 'sendTemplate', 'sendInteractiveButtons', 'sendInteractiveList', 'sendInteractiveCTA', 'markAsRead'] },
      phoneNumberId: { type: 'string', description: 'WhatsApp Phone Number ID (auto-resolved if absent)', required: false },
      businessAccountId: { type: 'string', description: 'WhatsApp Business Account ID (auto-resolved if absent)', required: false },
      to: { type: 'string', description: 'Recipient phone number in E.164 format', required: false },
      text: { type: 'string', description: 'Message text', required: false },
      previewUrl: { type: 'boolean', description: 'Enable URL preview in text messages', required: false, default: false },
      mediaType: { type: 'string', description: 'Media type', required: false, examples: ['image', 'video', 'audio', 'document', 'sticker'] },
      mediaUrl: { type: 'string', description: 'Media URL', required: false },
      mediaId: { type: 'string', description: 'Media ID (alternative to mediaUrl)', required: false },
      caption: { type: 'string', description: 'Media caption', required: false },
      latitude: { type: 'number', description: 'Location latitude', required: false },
      longitude: { type: 'number', description: 'Location longitude', required: false },
      locationName: { type: 'string', description: 'Location name', required: false },
      address: { type: 'string', description: 'Location address', required: false },
      contacts: { type: 'array', description: 'Contact objects for sendContact', required: false },
      templateName: { type: 'string', description: 'Template name', required: false },
      language: { type: 'string', description: 'Template language code (e.g. en_US)', required: false },
      templateComponents: { type: 'array', description: 'Template components', required: false },
      templateCategory: { type: 'string', description: 'Template category', required: false, examples: ['MARKETING', 'UTILITY', 'AUTHENTICATION'] },
      templateStatus: { type: 'string', description: 'Template approval status (must be APPROVED to send)', required: false },
      bodyText: { type: 'string', description: 'Interactive message body text', required: false },
      headerText: { type: 'string', description: 'Interactive message header text', required: false },
      footerText: { type: 'string', description: 'Interactive message footer text', required: false },
      buttons: { type: 'array', description: 'Interactive buttons', required: false },
      buttonText: { type: 'string', description: 'List button text', required: false },
      sections: { type: 'array', description: 'List sections', required: false },
      ctaUrl: { type: 'object', description: 'CTA URL object { display_text, url }', required: false },
      messageId: { type: 'string', description: 'Message ID (for markAsRead)', required: false },
      contactId: { type: 'string', description: 'Contact ID', required: false },
      contactName: { type: 'string', description: 'Contact name', required: false },
      contactPhone: { type: 'string', description: 'Contact phone', required: false },
      contactEmail: { type: 'string', description: 'Contact email', required: false },
      labels: { type: 'array', description: 'Contact labels', required: false },
      conversationId: { type: 'string', description: 'Conversation ID', required: false },
      recipients: { type: 'array', description: 'Campaign recipients (array of phone numbers)', required: false },
      limit: { type: 'number', description: 'Pagination limit', required: false, default: 20 },
      after: { type: 'string', description: 'Pagination cursor', required: false },
      returnAll: { type: 'boolean', description: 'Return all results (ignores limit)', required: false, default: false },
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
        const { supabase, userId, currentUserId, config } = context;
        const result = await executeSocialNode(supabase, { provider: 'whatsapp', operation: config.operation ?? 'sendText', ...config }, userId, currentUserId);
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
