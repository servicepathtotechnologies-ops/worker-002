/**
 * Node Credential Requirements
 * Comprehensive mapping of nodes to their required credentials
 * Ensures smooth UI flow for credential collection
 */

export interface NodeCredentialRequirement {
  nodeType: string;
  requiredCredentials: CredentialField[];
  optionalCredentials?: CredentialField[];
  authMethod: 'oauth' | 'api_key' | 'webhook' | 'token' | 'none';
  oauthProvider?: 'google' | 'linkedin' | 'github' | 'microsoft';
}

export interface CredentialField {
  fieldName: string;
  displayName: string;
  type: 'password' | 'text' | 'url' | 'oauth';
  description: string;
  placeholder?: string;
  helpText?: string;
  validation?: (value: string) => boolean | string;
}

/**
 * Comprehensive credential requirements for all nodes
 */
export const NODE_CREDENTIAL_REQUIREMENTS: Map<string, NodeCredentialRequirement> = new Map([
  // ============================================
  // SLACK NODES
  // ============================================
  ['slack_message', {
    nodeType: 'slack_message',
    requiredCredentials: [{
      fieldName: 'webhookUrl',
      displayName: 'Slack Webhook URL',
      type: 'url',
      description: 'Slack incoming webhook URL for sending messages',
      placeholder: 'https://hooks.slack.com/services/...',
      helpText: 'Create a webhook in Slack: Apps → Incoming Webhooks → Add New Webhook',
      validation: (value: string) => {
        if (!value) return 'Webhook URL is required';
        if (!value.startsWith('https://hooks.slack.com/')) {
          return 'Invalid Slack webhook URL format';
        }
        return true;
      },
    }],
    authMethod: 'webhook',
  }],

  // ============================================
  // LINKEDIN NODES
  // ============================================
  ['linkedin', {
    nodeType: 'linkedin',
    requiredCredentials: [{
      fieldName: 'accessToken',
      displayName: 'LinkedIn OAuth',
      type: 'oauth',
      description: 'Connect your LinkedIn account via OAuth to allow posting to your profile.',
      helpText: 'Click \"Connect LinkedIn\" to authorize this workspace with your LinkedIn account. Tokens are stored securely in Supabase (linkedin_oauth_tokens) and used automatically by LinkedIn nodes.',
    }],
    authMethod: 'oauth',
    oauthProvider: 'linkedin',
  }],

  // ============================================
  // TWITTER NODES
  // ============================================
  ['twitter', {
    nodeType: 'twitter',
    requiredCredentials: [
      {
        fieldName: 'apiKey',
        displayName: 'Twitter API Key',
        type: 'password',
        description: 'Twitter API key from Twitter Developer Portal',
        placeholder: 'Enter your Twitter API key',
      },
      {
        fieldName: 'apiSecret',
        displayName: 'Twitter API Secret',
        type: 'password',
        description: 'Twitter API secret from Twitter Developer Portal',
        placeholder: 'Enter your Twitter API secret',
      },
      {
        fieldName: 'accessToken',
        displayName: 'Twitter Access Token',
        type: 'password',
        description: 'Twitter access token',
        placeholder: 'Enter your Twitter access token',
      },
      {
        fieldName: 'accessTokenSecret',
        displayName: 'Twitter Access Token Secret',
        type: 'password',
        description: 'Twitter access token secret',
        placeholder: 'Enter your Twitter access token secret',
      },
    ],
    authMethod: 'api_key',
  }],

  // ============================================
  // INSTAGRAM NODES
  // ============================================
  ['instagram', {
    nodeType: 'instagram',
    requiredCredentials: [
      {
        fieldName: 'accessToken',
        displayName: 'Instagram Access Token',
        type: 'password',
        description: 'Instagram Graph API access token',
        placeholder: 'Enter your Instagram access token',
      },
    ],
    authMethod: 'token',
  }],

  // ============================================
  // GOOGLE SERVICES (OAuth handled via navbar)
  // ============================================
  ['google_sheets', {
    nodeType: 'google_sheets',
    requiredCredentials: [{
      fieldName: 'spreadsheetId',
      displayName: 'Google Sheets URL or ID',
      type: 'url',
      description: 'The Google Sheets URL or spreadsheet ID where data is stored',
      placeholder: 'https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j/edit or 1a2b3c4d5e6f7g8h9i0j',
      helpText: 'Copy the full Google Sheets URL from your browser, or extract the ID from the URL (the part after /d/ and before /edit)',
      validation: (value: string) => {
        if (!value) return 'Google Sheets URL or ID is required';
        // Accept full URL or just the ID
        const urlPattern = /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
        const idPattern = /^[a-zA-Z0-9-_]+$/;
        if (urlPattern.test(value) || idPattern.test(value)) {
          return true;
        }
        return 'Invalid Google Sheets URL or ID format';
      },
    }],
    authMethod: 'oauth',
    oauthProvider: 'google',
  }],

  ['google_gmail', {
    nodeType: 'google_gmail',
    requiredCredentials: [{
      fieldName: 'from',
      displayName: 'Gmail Sender Email Address',
      type: 'text',
      description: 'The Gmail email address to send emails from (must be connected via OAuth)',
      placeholder: 'your-email@gmail.com',
      helpText: 'Enter the Gmail address that will send emails. This account must be connected via the Connections panel.',
      validation: (value: string) => {
        if (!value) return 'Gmail sender email is required';
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailPattern.test(value)) {
          return true;
        }
        return 'Invalid email address format';
      },
    }],
    authMethod: 'oauth',
    oauthProvider: 'google',
  }],

  ['google_drive', {
    nodeType: 'google_drive',
    requiredCredentials: [],
    authMethod: 'oauth',
    oauthProvider: 'google',
  }],

  ['google_doc', {
    nodeType: 'google_doc',
    requiredCredentials: [{
      fieldName: 'documentId',
      displayName: 'Google Docs URL or Document ID',
      type: 'url',
      description: 'The Google Docs URL or document ID where content is stored',
      placeholder: 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit or 1a2b3c4d5e6f7g8h9i0j',
      helpText: 'Copy the full Google Docs URL from your browser, or extract the ID from the URL (the part after /d/ and before /edit)',
      validation: (value: string) => {
        if (!value) return 'Google Docs URL or Document ID is required';
        // Accept full URL or just the ID
        const urlPattern = /docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/;
        const idPattern = /^[a-zA-Z0-9-_]+$/;
        if (urlPattern.test(value) || idPattern.test(value)) {
          return true;
        }
        return 'Invalid Google Docs URL or Document ID format';
      },
    }],
    authMethod: 'oauth',
    oauthProvider: 'google',
  }],

  // ============================================
  // DATABASE NODES
  // ============================================
  ['database_read', {
    nodeType: 'database_read',
    requiredCredentials: [
      {
        fieldName: 'connectionString',
        displayName: 'Database Connection String',
        type: 'password',
        description: 'Database connection string (e.g., postgresql://user:pass@host:port/db)',
        placeholder: 'postgresql://user:password@localhost:5432/database',
        helpText: 'Format: postgresql://username:password@host:port/database',
      },
    ],
    authMethod: 'api_key',
  }],

  ['database_write', {
    nodeType: 'database_write',
    requiredCredentials: [
      {
        fieldName: 'connectionString',
        displayName: 'Database Connection String',
        type: 'password',
        description: 'Database connection string',
        placeholder: 'postgresql://user:password@localhost:5432/database',
      },
    ],
    authMethod: 'api_key',
  }],

  // ============================================
  // HTTP/API NODES
  // ============================================
  ['http_request', {
    nodeType: 'http_request',
    requiredCredentials: [],
    authMethod: 'none',
    optionalCredentials: [
      {
        fieldName: 'apiKey',
        displayName: 'API Key',
        type: 'password',
        description: 'API key for authentication (if required)',
        placeholder: 'Enter API key',
      },
      {
        fieldName: 'bearerToken',
        displayName: 'Bearer Token',
        type: 'password',
        description: 'Bearer token for authentication (if required)',
        placeholder: 'Enter bearer token',
      },
    ],
  }],

  // ============================================
  // DISCORD NODES
  // ============================================
  ['discord', {
    nodeType: 'discord',
    requiredCredentials: [{
      fieldName: 'webhookUrl',
      displayName: 'Discord Webhook URL',
      type: 'url',
      description: 'Discord webhook URL for sending messages',
      placeholder: 'https://discord.com/api/webhooks/...',
      helpText: 'Create a webhook in Discord: Server Settings → Integrations → Webhooks',
      validation: (value: string) => {
        if (!value) return 'Webhook URL is required';
        if (!value.startsWith('https://discord.com/api/webhooks/')) {
          return 'Invalid Discord webhook URL format';
        }
        return true;
      },
    }],
    authMethod: 'webhook',
  }],

  // ============================================
  // EMAIL NODES
  // ============================================
  ['email', {
    nodeType: 'email',
    requiredCredentials: [
      {
        fieldName: 'smtpHost',
        displayName: 'SMTP Host',
        type: 'text',
        description: 'SMTP server hostname',
        placeholder: 'smtp.gmail.com',
      },
      {
        fieldName: 'smtpPort',
        displayName: 'SMTP Port',
        type: 'text',
        description: 'SMTP server port',
        placeholder: '587',
      },
      {
        fieldName: 'smtpUser',
        displayName: 'SMTP Username',
        type: 'text',
        description: 'SMTP username/email',
        placeholder: 'your-email@example.com',
      },
      {
        fieldName: 'smtpPassword',
        displayName: 'SMTP Password',
        type: 'password',
        description: 'SMTP password or app password',
        placeholder: 'Enter SMTP password',
      },
    ],
    authMethod: 'api_key',
  }],

  // ============================================
  // CRM NODES
  // ============================================
  ['hubspot', {
    nodeType: 'hubspot',
    requiredCredentials: [{
      fieldName: 'apiKey',
      displayName: 'HubSpot API Key',
      type: 'password',
      description: 'HubSpot API key from your account settings',
      placeholder: 'Enter HubSpot API key',
      helpText: 'Get your API key from HubSpot: Settings → Integrations → Private Apps',
    }],
    authMethod: 'api_key',
  }],

  ['salesforce', {
    nodeType: 'salesforce',
    requiredCredentials: [
      {
        fieldName: 'username',
        displayName: 'Salesforce Username',
        type: 'text',
        description: 'Salesforce username',
        placeholder: 'user@example.com',
      },
      {
        fieldName: 'password',
        displayName: 'Salesforce Password',
        type: 'password',
        description: 'Salesforce password + security token',
        placeholder: 'Enter password',
      },
    ],
    authMethod: 'api_key',
  }],

  ['pipedrive', {
    nodeType: 'pipedrive',
    requiredCredentials: [{
      fieldName: 'apiToken',
      displayName: 'Pipedrive API Token',
      type: 'password',
      description: 'Pipedrive API token',
      placeholder: 'Enter Pipedrive API token',
      helpText: 'Get your API token from Pipedrive: Settings → Personal → API',
    }],
    authMethod: 'api_key',
  }],

  ['mailchimp', {
    nodeType: 'mailchimp',
    requiredCredentials: [{
      fieldName: 'apiKey',
      displayName: 'Mailchimp API Key',
      type: 'password',
      description: 'Mailchimp API key',
      placeholder: 'Enter Mailchimp API key',
      helpText: 'Get your API key from Mailchimp: Account → Extras → API keys',
    }],
    authMethod: 'api_key',
  }],

  // ============================================
  // AI NODES (Ollama - no credentials needed)
  // ============================================
  ['ai_agent', {
    nodeType: 'ai_agent',
    requiredCredentials: [], // Ollama doesn't need API keys
    authMethod: 'none',
  }],

  // ============================================
  // NOTE: For nodes not listed here, the ComprehensiveCredentialScanner
  // will automatically fall back to schema-based detection, checking:
  // 1. Required fields in node schema
  // 2. Optional fields with credential-like names
  // 3. Field names containing: api_key, token, secret, password, auth, webhook, etc.
  // This ensures 100% credential coverage even for unmapped node types.
  // ============================================
]);

/**
 * Get credential requirements for a node type
 */
export function getNodeCredentialRequirements(nodeType: string): NodeCredentialRequirement | null {
  return NODE_CREDENTIAL_REQUIREMENTS.get(nodeType) || null;
}

/**
 * Check if a node requires credentials
 */
export function nodeRequiresCredentials(nodeType: string): boolean {
  const requirements = getNodeCredentialRequirements(nodeType);
  if (!requirements) return false;
  
  // OAuth nodes don't require manual credential input (handled via UI)
  if (requirements.authMethod === 'oauth') {
    return false; // OAuth is handled via Connections panel
  }
  
  return requirements.requiredCredentials.length > 0;
}

/**
 * Get all credential fields for a node
 */
export function getCredentialFieldsForNode(nodeType: string): CredentialField[] {
  const requirements = getNodeCredentialRequirements(nodeType);
  if (!requirements) return [];
  
  return [
    ...requirements.requiredCredentials,
    ...(requirements.optionalCredentials || []),
  ];
}

/**
 * Get required credential fields only
 */
export function getRequiredCredentialFieldsForNode(nodeType: string): CredentialField[] {
  const requirements = getNodeCredentialRequirements(nodeType);
  if (!requirements) return [];
  
  return requirements.requiredCredentials;
}

/**
 * Format credential field name for UI display
 */
export function formatCredentialFieldName(fieldName: string): string {
  // Convert snake_case or camelCase to Title Case
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Validate credential value
 */
export function validateCredentialValue(field: CredentialField, value: string): boolean | string {
  if (!value && field.type !== 'oauth') {
    return `${field.displayName} is required`;
  }
  
  if (field.validation) {
    return field.validation(value);
  }
  
  // Default validations
  if (field.type === 'url' && value) {
    try {
      new URL(value);
      return true;
    } catch {
      return 'Invalid URL format';
    }
  }
  
  return true;
}
