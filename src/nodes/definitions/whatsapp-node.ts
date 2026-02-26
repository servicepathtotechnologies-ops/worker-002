import { NodeDefinition } from '../../core/types/node-definition';

/**
 * WhatsApp Node Definition
 * 
 * Comprehensive integration with WhatsApp Cloud API (v18.0+).
 * Supports multiple resources (Message, Media, Template, Business Profile, Phone Number, Webhook)
 * and operations (Send Text, Send Media, Send Template, Upload Media, etc.)
 * similar to n8n's WhatsApp node.
 * 
 * Uses direct HTTP calls to WhatsApp Cloud API (part of Facebook Graph API) for reliable
 * API interaction with OAuth 2.0 support, automatic pagination, error handling, and type safety.
 * 
 * Authentication: Requires Facebook OAuth token with WhatsApp permissions:
 * - whatsapp_business_messaging
 * - whatsapp_business_management
 * - whatsapp_business_profile
 */
export const whatsappNodeDefinition: NodeDefinition = {
  type: 'whatsapp',
  label: 'WhatsApp',
  category: 'social',
  description: 'Interact with WhatsApp Cloud API to send messages, manage templates, upload media, and more',
  icon: 'MessageCircle',
  version: 1,

  inputSchema: {
    resource: {
      type: 'string',
      description: 'Resource type to operate on',
      required: true,
      default: 'message',
      examples: ['message', 'media', 'template', 'businessProfile', 'phoneNumber', 'webhook'],
      validation: (value) => {
        const validResources = ['message', 'media', 'template', 'businessProfile', 'phoneNumber', 'webhook'];
        if (!validResources.includes(value)) {
          return `Resource must be one of: ${validResources.join(', ')}`;
        }
        return true;
      },
    },
    operation: {
      type: 'string',
      description: 'Operation to perform',
      required: true,
      default: 'sendText',
      examples: [
        // Message operations
        'sendText', 'sendMedia', 'sendLocation', 'sendContact', 'sendReaction', 'sendTemplate',
        'sendInteractiveButtons', 'sendInteractiveList', 'sendInteractiveCTA', 'sendInteractiveCatalog',
        'markAsRead', 'get',
        // Media operations
        'upload', 'get', 'delete',
        // Template operations
        'list', 'get', 'create', 'update', 'delete',
        // Business Profile operations
        'get', 'update',
        // Phone Number operations
        'list', 'get', 'register', 'deregister',
        // Webhook operations
        'subscribe', 'unsubscribe',
      ],
      validation: (value) => {
        // Operation validation is resource-dependent, so we'll validate in validateInputs
        return true;
      },
    },
    // Common parameters
    phoneNumberId: {
      type: 'string',
      description: 'Phone Number ID (required for most operations)',
      required: false,
      default: '',
    },
    businessAccountId: {
      type: 'string',
      description: 'WhatsApp Business Account ID (WABA ID). If not provided, will attempt to fetch automatically.',
      required: false,
      default: '',
    },
    // Message operations
    to: {
      type: 'string',
      description: 'Recipient phone number in international format (e.g., +1234567890)',
      required: false,
      default: '',
    },
    text: {
      type: 'string',
      description: 'Message text content',
      required: false,
      default: '',
    },
    previewUrl: {
      type: 'boolean',
      description: 'Enable URL preview in text messages',
      required: false,
      default: false,
    },
    recipientType: {
      type: 'string',
      description: 'Recipient type: individual or group',
      required: false,
      default: 'individual',
      examples: ['individual', 'group'],
    },
    mediaType: {
      type: 'string',
      description: 'Media type: image, video, audio, document, sticker',
      required: false,
      default: 'image',
      examples: ['image', 'video', 'audio', 'document', 'sticker'],
    },
    mediaUrl: {
      type: 'string',
      description: 'URL of the media to send',
      required: false,
      default: '',
    },
    mediaId: {
      type: 'string',
      description: 'Media ID from previous upload',
      required: false,
      default: '',
    },
    caption: {
      type: 'string',
      description: 'Caption for image/video/document',
      required: false,
      default: '',
    },
    filename: {
      type: 'string',
      description: 'Filename for document',
      required: false,
      default: '',
    },
    latitude: {
      type: 'number',
      description: 'Latitude for location message',
      required: false,
      default: null,
    },
    longitude: {
      type: 'number',
      description: 'Longitude for location message',
      required: false,
      default: null,
    },
    locationName: {
      type: 'string',
      description: 'Name for location',
      required: false,
      default: '',
    },
    address: {
      type: 'string',
      description: 'Address for location',
      required: false,
      default: '',
    },
    contacts: {
      type: 'json',
      description: 'Array of contact objects (for sendContact)',
      required: false,
      default: null,
    },
    messageId: {
      type: 'string',
      description: 'Message ID (for reaction, markAsRead, get)',
      required: false,
      default: '',
    },
    emoji: {
      type: 'string',
      description: 'Emoji for reaction (e.g., 👍)',
      required: false,
      default: '',
    },
    templateName: {
      type: 'string',
      description: 'Template name (for sendTemplate, template operations)',
      required: false,
      default: '',
    },
    language: {
      type: 'string',
      description: 'Language code (e.g., en_US)',
      required: false,
      default: 'en_US',
    },
    templateComponents: {
      type: 'json',
      description: 'Template components array (header, body, buttons)',
      required: false,
      default: null,
    },
    namespace: {
      type: 'string',
      description: 'Template namespace',
      required: false,
      default: '',
    },
    // Interactive message parameters
    bodyText: {
      type: 'string',
      description: 'Body text for interactive messages',
      required: false,
      default: '',
    },
    headerText: {
      type: 'string',
      description: 'Header text for interactive messages',
      required: false,
      default: '',
    },
    footerText: {
      type: 'string',
      description: 'Footer text for interactive messages',
      required: false,
      default: '',
    },
    buttons: {
      type: 'json',
      description: 'Array of button objects for interactive buttons',
      required: false,
      default: null,
    },
    buttonText: {
      type: 'string',
      description: 'Button text for interactive list',
      required: false,
      default: '',
    },
    sections: {
      type: 'json',
      description: 'Array of sections for interactive list',
      required: false,
      default: null,
    },
    ctaUrl: {
      type: 'json',
      description: 'CTA URL object with display_text and url',
      required: false,
      default: null,
    },
    catalogId: {
      type: 'string',
      description: 'Catalog ID for catalog message',
      required: false,
      default: '',
    },
    productSections: {
      type: 'json',
      description: 'Product sections array for catalog message',
      required: false,
      default: null,
    },
    // Media operations
    fileUrl: {
      type: 'string',
      description: 'File URL to upload',
      required: false,
      default: '',
    },
    fileData: {
      type: 'string',
      description: 'Base64-encoded file data',
      required: false,
      default: '',
    },
    mimeType: {
      type: 'string',
      description: 'MIME type of the file',
      required: false,
      default: '',
    },
    // Template operations
    templateCategory: {
      type: 'string',
      description: 'Template category: MARKETING, UTILITY, AUTHENTICATION',
      required: false,
      default: 'UTILITY',
      examples: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
    },
    templateComponentsCreate: {
      type: 'json',
      description: 'Template components for create/update (array of header/body/footer/buttons)',
      required: false,
      default: null,
    },
    // Business Profile operations
    profileFields: {
      type: 'string',
      description: 'Comma-separated list of fields to return',
      required: false,
      default: '',
    },
    about: {
      type: 'string',
      description: 'Business about text',
      required: false,
      default: '',
    },
    description: {
      type: 'string',
      description: 'Business description',
      required: false,
      default: '',
    },
    email: {
      type: 'string',
      description: 'Business email',
      required: false,
      default: '',
    },
    profileAddress: {
      type: 'string',
      description: 'Business address',
      required: false,
      default: '',
    },
    vertical: {
      type: 'string',
      description: 'Business vertical/category',
      required: false,
      default: '',
    },
    websites: {
      type: 'json',
      description: 'Array of website URLs',
      required: false,
      default: null,
    },
    // Phone Number operations
    phoneNumberFields: {
      type: 'string',
      description: 'Comma-separated list of fields to return',
      required: false,
      default: '',
    },
    pin: {
      type: 'string',
      description: 'PIN for two-step verification (register)',
      required: false,
      default: '',
    },
    // Webhook operations
    webhookUrl: {
      type: 'string',
      description: 'Webhook URL to subscribe to',
      required: false,
      default: '',
    },
    webhookFields: {
      type: 'string',
      description: 'Comma-separated list of webhook fields',
      required: false,
      default: '',
    },
    // Pagination
    limit: {
      type: 'number',
      description: 'Maximum number of results to return (1-100)',
      required: false,
      default: 25,
      validation: (value) => {
        if (value && (value < 1 || value > 100)) {
          return 'Limit must be between 1 and 100';
        }
        return true;
      },
    },
    after: {
      type: 'string',
      description: 'Cursor for pagination (after)',
      required: false,
      default: '',
    },
    before: {
      type: 'string',
      description: 'Cursor for pagination (before)',
      required: false,
      default: '',
    },
    returnAll: {
      type: 'boolean',
      description: 'Return all results (automatically paginate)',
      required: false,
      default: false,
    },
  },

  outputSchema: {
    default: {
      type: 'json',
      description: 'WhatsApp operation result (varies by operation)',
    },
  },

  requiredInputs: ['resource', 'operation'],
  outgoingPorts: ['default'],
  incomingPorts: ['default'],
  isBranching: false,

  validateInputs: (inputs) => {
    const errors: string[] = [];

    // Required fields
    if (!inputs.resource) {
      errors.push('resource field is required');
    }
    if (!inputs.operation) {
      errors.push('operation field is required');
    }

    const resource = inputs.resource;
    const operation = inputs.operation;

    // Resource-specific validation
    if (resource === 'message') {
      if (['sendText', 'sendMedia', 'sendLocation', 'sendContact', 'sendReaction', 'sendTemplate', 
           'sendInteractiveButtons', 'sendInteractiveList', 'sendInteractiveCTA', 'sendInteractiveCatalog'].includes(operation)) {
        if (!inputs.to || typeof inputs.to !== 'string' || inputs.to.trim() === '') {
          errors.push('to (recipient phone number) is required for send operations');
        }
        if (!inputs.phoneNumberId || typeof inputs.phoneNumberId !== 'string' || inputs.phoneNumberId.trim() === '') {
          errors.push('phoneNumberId is required for send operations');
        }
      }
      if (operation === 'sendText') {
        if (!inputs.text || typeof inputs.text !== 'string' || inputs.text.trim() === '') {
          errors.push('text is required for sendText operation');
        }
      }
      if (operation === 'sendMedia') {
        const hasMediaUrl = inputs.mediaUrl && typeof inputs.mediaUrl === 'string' && inputs.mediaUrl.trim() !== '';
        const hasMediaId = inputs.mediaId && typeof inputs.mediaId === 'string' && inputs.mediaId.trim() !== '';
        if (!hasMediaUrl && !hasMediaId) {
          errors.push('Either mediaUrl or mediaId is required for sendMedia operation');
        }
        if (!inputs.mediaType || !['image', 'video', 'audio', 'document', 'sticker'].includes(inputs.mediaType)) {
          errors.push('mediaType must be one of: image, video, audio, document, sticker');
        }
      }
      if (operation === 'sendLocation') {
        if (inputs.latitude === null || inputs.latitude === undefined || typeof inputs.latitude !== 'number') {
          errors.push('latitude is required for sendLocation operation');
        }
        if (inputs.longitude === null || inputs.longitude === undefined || typeof inputs.longitude !== 'number') {
          errors.push('longitude is required for sendLocation operation');
        }
      }
      if (operation === 'sendContact') {
        if (!inputs.contacts || !Array.isArray(inputs.contacts) || inputs.contacts.length === 0) {
          errors.push('contacts (array) is required for sendContact operation');
        }
      }
      if (operation === 'sendReaction') {
        if (!inputs.messageId || typeof inputs.messageId !== 'string' || inputs.messageId.trim() === '') {
          errors.push('messageId is required for sendReaction operation');
        }
        if (!inputs.emoji || typeof inputs.emoji !== 'string' || inputs.emoji.trim() === '') {
          errors.push('emoji is required for sendReaction operation');
        }
      }
      if (operation === 'sendTemplate') {
        if (!inputs.templateName || typeof inputs.templateName !== 'string' || inputs.templateName.trim() === '') {
          errors.push('templateName is required for sendTemplate operation');
        }
        if (!inputs.language || typeof inputs.language !== 'string' || inputs.language.trim() === '') {
          errors.push('language is required for sendTemplate operation');
        }
      }
      if (['sendInteractiveButtons', 'sendInteractiveList', 'sendInteractiveCTA'].includes(operation)) {
        if (!inputs.bodyText || typeof inputs.bodyText !== 'string' || inputs.bodyText.trim() === '') {
          errors.push('bodyText is required for interactive message operations');
        }
      }
      if (operation === 'sendInteractiveButtons') {
        if (!inputs.buttons || !Array.isArray(inputs.buttons) || inputs.buttons.length === 0) {
          errors.push('buttons (array) is required for sendInteractiveButtons operation');
        }
      }
      if (operation === 'sendInteractiveList') {
        if (!inputs.buttonText || typeof inputs.buttonText !== 'string' || inputs.buttonText.trim() === '') {
          errors.push('buttonText is required for sendInteractiveList operation');
        }
        if (!inputs.sections || !Array.isArray(inputs.sections) || inputs.sections.length === 0) {
          errors.push('sections (array) is required for sendInteractiveList operation');
        }
      }
      if (operation === 'sendInteractiveCTA') {
        if (!inputs.ctaUrl || typeof inputs.ctaUrl !== 'object') {
          errors.push('ctaUrl (object) is required for sendInteractiveCTA operation');
        }
      }
      if (operation === 'sendInteractiveCatalog') {
        if (!inputs.catalogId || typeof inputs.catalogId !== 'string' || inputs.catalogId.trim() === '') {
          errors.push('catalogId is required for sendInteractiveCatalog operation');
        }
      }
      if (operation === 'markAsRead') {
        if (!inputs.messageId || typeof inputs.messageId !== 'string' || inputs.messageId.trim() === '') {
          errors.push('messageId is required for markAsRead operation');
        }
      }
      if (operation === 'get') {
        if (!inputs.messageId || typeof inputs.messageId !== 'string' || inputs.messageId.trim() === '') {
          errors.push('messageId is required for get operation');
        }
      }
    } else if (resource === 'media') {
      if (operation === 'upload') {
        const hasFileUrl = inputs.fileUrl && typeof inputs.fileUrl === 'string' && inputs.fileUrl.trim() !== '';
        const hasFileData = inputs.fileData && typeof inputs.fileData === 'string' && inputs.fileData.trim() !== '';
        if (!hasFileUrl && !hasFileData) {
          errors.push('Either fileUrl or fileData is required for upload operation');
        }
        if (!inputs.mimeType || typeof inputs.mimeType !== 'string' || inputs.mimeType.trim() === '') {
          errors.push('mimeType is required for upload operation');
        }
        if (!inputs.phoneNumberId || typeof inputs.phoneNumberId !== 'string' || inputs.phoneNumberId.trim() === '') {
          errors.push('phoneNumberId is required for upload operation');
        }
      }
      if (['get', 'delete'].includes(operation)) {
        if (!inputs.mediaId || typeof inputs.mediaId !== 'string' || inputs.mediaId.trim() === '') {
          errors.push('mediaId is required for this operation');
        }
      }
    } else if (resource === 'template') {
      if (['list', 'create', 'delete'].includes(operation)) {
        if (!inputs.businessAccountId || typeof inputs.businessAccountId !== 'string' || inputs.businessAccountId.trim() === '') {
          // Warning only - will try to fetch automatically
        }
      }
      if (['get', 'update', 'delete'].includes(operation)) {
        if (!inputs.templateName || typeof inputs.templateName !== 'string' || inputs.templateName.trim() === '') {
          errors.push('templateName is required for this operation');
        }
      }
      if (operation === 'create') {
        if (!inputs.templateName || typeof inputs.templateName !== 'string' || inputs.templateName.trim() === '') {
          errors.push('templateName is required for create operation');
        }
        if (!inputs.language || typeof inputs.language !== 'string' || inputs.language.trim() === '') {
          errors.push('language is required for create operation');
        }
        if (!inputs.templateCategory || !['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(inputs.templateCategory)) {
          errors.push('templateCategory must be one of: MARKETING, UTILITY, AUTHENTICATION');
        }
        if (!inputs.templateComponentsCreate || !Array.isArray(inputs.templateComponentsCreate) || inputs.templateComponentsCreate.length === 0) {
          errors.push('templateComponentsCreate (array) is required for create operation');
        }
      }
    } else if (resource === 'businessProfile') {
      if (!inputs.phoneNumberId || typeof inputs.phoneNumberId !== 'string' || inputs.phoneNumberId.trim() === '') {
        errors.push('phoneNumberId is required for businessProfile operations');
      }
    } else if (resource === 'phoneNumber') {
      if (['get', 'register', 'deregister'].includes(operation)) {
        if (!inputs.phoneNumberId || typeof inputs.phoneNumberId !== 'string' || inputs.phoneNumberId.trim() === '') {
          errors.push('phoneNumberId is required for this operation');
        }
      }
      if (operation === 'list') {
        if (!inputs.businessAccountId || typeof inputs.businessAccountId !== 'string' || inputs.businessAccountId.trim() === '') {
          // Warning only
        }
      }
      if (operation === 'register') {
        if (!inputs.pin || typeof inputs.pin !== 'string' || inputs.pin.trim() === '') {
          errors.push('pin is required for register operation');
        }
      }
    } else if (resource === 'webhook') {
      if (operation === 'subscribe') {
        if (!inputs.businessAccountId || typeof inputs.businessAccountId !== 'string' || inputs.businessAccountId.trim() === '') {
          // Warning only
        }
        if (!inputs.webhookUrl || typeof inputs.webhookUrl !== 'string' || inputs.webhookUrl.trim() === '') {
          errors.push('webhookUrl is required for subscribe operation');
        }
      }
      if (operation === 'unsubscribe') {
        if (!inputs.businessAccountId || typeof inputs.businessAccountId !== 'string' || inputs.businessAccountId.trim() === '') {
          // Warning only
        }
      }
    }

    // Validate limit
    if (inputs.limit && (typeof inputs.limit !== 'number' || inputs.limit < 1 || inputs.limit > 100)) {
      errors.push('limit must be a number between 1 and 100');
    }

    return { valid: errors.length === 0, errors };
  },

  defaultInputs: () => ({
    resource: 'message',
    operation: 'sendText',
    phoneNumberId: '',
    businessAccountId: '',
    to: '',
    text: '',
    previewUrl: false,
    recipientType: 'individual',
    mediaType: 'image',
    mediaUrl: '',
    mediaId: '',
    caption: '',
    filename: '',
    latitude: null,
    longitude: null,
    locationName: '',
    address: '',
    contacts: null,
    messageId: '',
    emoji: '',
    templateName: '',
    language: 'en_US',
    templateComponents: null,
    namespace: '',
    bodyText: '',
    headerText: '',
    footerText: '',
    buttons: null,
    buttonText: '',
    sections: null,
    ctaUrl: null,
    catalogId: '',
    productSections: null,
    fileUrl: '',
    fileData: '',
    mimeType: '',
    templateCategory: 'UTILITY',
    templateComponentsCreate: null,
    profileFields: '',
    about: '',
    description: '',
    email: '',
    profileAddress: '',
    vertical: '',
    websites: null,
    phoneNumberFields: '',
    pin: '',
    webhookUrl: '',
    webhookFields: '',
    limit: 25,
    after: '',
    before: '',
    returnAll: false,
  }),
};
