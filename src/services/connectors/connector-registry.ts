/**
 * Connector Registry - Production-Grade Connector Architecture
 * 
 * This is the single source of truth for all connectors in the system.
 * Each connector is a first-class object with strict isolation.
 * 
 * Principles:
 * - No credential sharing across connectors
 * - Each connector has explicit credential contracts
 * - Connectors define capabilities, not nodes
 * - Provider disambiguation is deterministic
 */

export interface CredentialContract {
  provider: string;
  type: 'oauth' | 'api_key' | 'webhook' | 'token' | 'basic_auth' | 'runtime';
  scopes?: string[];
  vaultKey: string;
  displayName: string;
  required: boolean;
  // ✅ PERMANENT: Data-driven field mapping (replaces hardcoded if-else blocks)
  // Specifies which config field to use for this credential type
  credentialFieldName?: string; // e.g., 'apiKey', 'apiToken', 'webhookUrl', 'accessToken'
}

export interface Connector {
  id: string; // Unique connector ID (e.g., "google_gmail", "smtp_email")
  provider: string; // Provider name (e.g., "google", "smtp")
  service: string; // Service name (e.g., "gmail", "email")
  capabilities: string[]; // What this connector can do (e.g., ["email.send", "gmail.send"])
  keywords: string[]; // Keywords that match this connector
  credentialContract: CredentialContract;
  nodeTypes: string[]; // Which node types use this connector
  description: string;
}

/**
 * Connector Registry
 * 
 * All connectors are registered here with strict isolation.
 * Each connector has its own credential contract.
 */
export class ConnectorRegistry {
  private connectors: Map<string, Connector> = new Map();

  constructor() {
    this.registerAllConnectors();
  }

  /**
   * Register all connectors in the system
   */
  private registerAllConnectors(): void {
    // ============================================
    // GOOGLE GMAIL CONNECTOR
    // ============================================
    this.register({
      id: 'google_gmail',
      provider: 'google',
      service: 'gmail',
      capabilities: [
        'email.send',
        'gmail.send',
        'google.mail',
        'email.read',
        'gmail.read',
      ],
      keywords: ['gmail', 'google mail', 'google email', 'gmail them', 'send via gmail', 'email via gmail'],
      credentialContract: {
        provider: 'google',
        type: 'oauth',
        scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.read'],
        vaultKey: 'google',
        displayName: 'Google OAuth (Gmail)',
        required: true,
      },
      // ✅ Defensive: allow alias node type to match this connector even if canonicalization
      // hasn't run yet. Canonical type remains google_gmail.
      nodeTypes: ['google_gmail', 'gmail'],
      description: 'Send/receive emails via Gmail API using OAuth',
    });

    // ============================================
    // SMTP EMAIL CONNECTOR
    // ============================================
    this.register({
      id: 'smtp_email',
      provider: 'smtp',
      service: 'email',
      capabilities: [
        'email.send',
        'smtp.send',
      ],
      keywords: ['smtp', 'mail server', 'email server', 'send email', 'email notification'],
      credentialContract: {
        provider: 'smtp',
        type: 'api_key', // SMTP uses username/password (treated as api_key type)
        vaultKey: 'smtp',
        displayName: 'SMTP Credentials',
        required: true,
      },
      nodeTypes: ['email'],
      description: 'Send emails via SMTP server',
    });

    // ============================================
    // SLACK CONNECTOR
    // ============================================
    this.register({
      id: 'slack_webhook',
      provider: 'slack',
      service: 'slack',
      capabilities: [
        'notification.send',
        'slack.send',
        'message.send',
      ],
      keywords: ['slack', 'slack message', 'slack notification'],
      credentialContract: {
        provider: 'slack',
        type: 'webhook',
        vaultKey: 'slack',
        displayName: 'Slack Webhook URL',
        required: true,
        credentialFieldName: 'webhookUrl', // ✅ PERMANENT: Data-driven mapping
      },
      nodeTypes: ['slack_message'],
      description: 'Send messages to Slack via webhook',
    });

    // ============================================
    // GOOGLE SHEETS CONNECTOR
    // ============================================
    this.register({
      id: 'google_sheets',
      provider: 'google',
      service: 'sheets',
      capabilities: [
        'spreadsheet.read',
        'spreadsheet.write',
        'sheets.read',
        'sheets.write',
      ],
      keywords: ['google sheets', 'spreadsheet', 'sheets'],
      credentialContract: {
        provider: 'google',
        type: 'oauth',
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/spreadsheets'],
        vaultKey: 'google',
        displayName: 'Google OAuth (Sheets)',
        required: true,
      },
      nodeTypes: ['google_sheets'],
      description: 'Read/write Google Sheets via OAuth',
    });

    // ============================================
    // GOOGLE DOCS CONNECTOR
    // ============================================
    this.register({
      id: 'google_docs',
      provider: 'google',
      service: 'docs',
      capabilities: [
        'document.read',
        'document.write',
        'docs.read',
        'docs.write',
      ],
      keywords: ['google docs', 'google document'],
      credentialContract: {
        provider: 'google',
        type: 'oauth',
        scopes: ['https://www.googleapis.com/auth/documents.readonly', 'https://www.googleapis.com/auth/documents'],
        vaultKey: 'google',
        displayName: 'Google OAuth (Docs)',
        required: true,
      },
      nodeTypes: ['google_doc'],
      description: 'Read/write Google Docs via OAuth',
    });

    // ============================================
    // DISCORD CONNECTOR
    // ============================================
    this.register({
      id: 'discord_webhook',
      provider: 'discord',
      service: 'discord',
      capabilities: [
        'notification.send',
        'discord.send',
        'message.send',
      ],
      keywords: ['discord', 'discord message'],
      credentialContract: {
        provider: 'discord',
        type: 'webhook',
        vaultKey: 'discord',
        displayName: 'Discord Webhook URL',
        required: true,
      },
      nodeTypes: ['discord'],
      description: 'Send messages to Discord via webhook',
    });

    // ============================================
    // TELEGRAM CONNECTOR
    // ============================================
    this.register({
      id: 'telegram_bot',
      provider: 'telegram',
      service: 'telegram',
      capabilities: [
        'notification.send',
        'telegram.send',
        'message.send',
      ],
      keywords: ['telegram', 'telegram bot', 'telegram message'],
      credentialContract: {
        provider: 'telegram',
        type: 'token',
        // Telegram Bot API uses a bot token; no OAuth scopes,
        // but we still keep vaultKey for secure storage.
        vaultKey: 'telegram',
        displayName: 'Telegram Bot Token',
        required: true,
      },
      nodeTypes: ['telegram'],
      description: 'Send messages to Telegram chats via Bot API',
    });

    // ============================================
    // SALESFORCE CONNECTOR
    // ============================================
    this.register({
      id: 'salesforce',
      provider: 'salesforce',
      service: 'crm',
      capabilities: [
        'crm.read',
        'crm.write',
        'salesforce.crm',
      ],
      keywords: ['salesforce', 'sf', 'salesforce crm'],
      credentialContract: {
        provider: 'salesforce',
        type: 'oauth',
        // Typical Salesforce OAuth scopes; adjust if your app uses a specific set.
        scopes: [
          'api',
          'refresh_token',
        ],
        vaultKey: 'salesforce',
        displayName: 'Salesforce OAuth',
        required: true,
      },
      nodeTypes: ['salesforce'],
      description: 'Interact with Salesforce CRM objects via OAuth (sObjects, SOQL, SOSL)',
    });

    // ============================================
    // HUBSPOT CONNECTOR
    // ============================================
    this.register({
      id: 'hubspot',
      provider: 'hubspot',
      service: 'crm',
      capabilities: [
        'crm.read',
        'crm.write',
        'crm.search',
        'hubspot.contact',
        'hubspot.deal',
        'hubspot.company',
      ],
      keywords: ['hubspot', 'hub spot', 'hubspot crm'],
      credentialContract: {
        provider: 'hubspot',
        type: 'api_key', // HubSpot uses API keys or OAuth, but API key is most common
        vaultKey: 'hubspot',
        displayName: 'HubSpot API Key',
        required: true,
        credentialFieldName: 'apiKey', // ✅ PERMANENT: Data-driven mapping
      },
      nodeTypes: ['hubspot'],
      description: 'Interact with HubSpot CRM objects (contacts, companies, deals, tickets) via API key',
    });

    // ============================================
    // LINKEDIN CONNECTOR
    // ============================================
    this.register({
      id: 'linkedin_oauth',
      provider: 'linkedin',
      service: 'linkedin',
      capabilities: [
        'social.post',
        'linkedin.post',
      ],
      keywords: ['linkedin', 'linkedin post'],
      credentialContract: {
        provider: 'linkedin',
        type: 'oauth',
        scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social'],
        vaultKey: 'linkedin',
        displayName: 'LinkedIn OAuth',
        required: true,
      },
      nodeTypes: ['linkedin'],
      description: 'Post to LinkedIn via OAuth',
    });

    // ============================================
    // DATABASE CONNECTOR
    // ============================================
    this.register({
      id: 'database_connection',
      provider: 'database',
      service: 'database',
      capabilities: [
        'database.read',
        'database.write',
        'database.query',
      ],
      keywords: ['database', 'db', 'sql'],
      credentialContract: {
        provider: 'database',
        type: 'runtime',
        vaultKey: 'database',
        displayName: 'Database Connection String',
        required: true,
      },
      nodeTypes: ['database_read', 'database_write'],
      description: 'Connect to database via connection string',
    });

    // ============================================
    // CLICKUP CONNECTOR
    // ============================================
    this.register({
      id: 'clickup',
      provider: 'clickup',
      service: 'tasks',
      capabilities: [
        'clickup.task.create',
        'clickup.task.read',
      ],
      keywords: ['clickup', 'click up', 'project management', 'tasks'],
      credentialContract: {
        provider: 'clickup',
        type: 'api_key',
        vaultKey: 'clickup',
        displayName: 'ClickUp API Key',
        required: true,
        credentialFieldName: 'apiKey', // ✅ PERMANENT: Data-driven mapping
      },
      nodeTypes: ['clickup'],
      description: 'Create and read ClickUp tasks via API key authentication',
    });

    // ============================================
    // AIRTABLE CONNECTOR
    // ============================================
    this.register({
      id: 'airtable',
      provider: 'airtable',
      service: 'database',
      capabilities: [
        'database.read',
        'database.write',
        'airtable.record',
      ],
      keywords: ['airtable', 'air table'],
      credentialContract: {
        provider: 'airtable',
        type: 'api_key',
        vaultKey: 'airtable',
        displayName: 'Airtable API Key',
        required: true,
        credentialFieldName: 'apiKey', // ✅ PERMANENT: Data-driven mapping
      },
      nodeTypes: ['airtable'],
      description: 'Read/write Airtable records via API key',
    });

    // ============================================
    // NOTION CONNECTOR
    // ============================================
    this.register({
      id: 'notion',
      provider: 'notion',
      service: 'productivity',
      capabilities: [
        'notion.read',
        'notion.write',
        'notion.page',
      ],
      keywords: ['notion'],
      credentialContract: {
        provider: 'notion',
        type: 'api_key',
        vaultKey: 'notion',
        displayName: 'Notion API Key',
        required: true,
        credentialFieldName: 'apiKey', // ✅ PERMANENT: Data-driven mapping
      },
      nodeTypes: ['notion'],
      description: 'Read/write Notion pages and databases via API key',
    });

    // ============================================
    // PIPEDRIVE CONNECTOR
    // ============================================
    this.register({
      id: 'pipedrive',
      provider: 'pipedrive',
      service: 'crm',
      capabilities: [
        'crm.read',
        'crm.write',
        'pipedrive.deal',
      ],
      keywords: ['pipedrive', 'pipe drive'],
      credentialContract: {
        provider: 'pipedrive',
        type: 'api_key',
        vaultKey: 'pipedrive',
        displayName: 'Pipedrive API Token',
        required: true,
        credentialFieldName: 'apiToken', // ✅ PERMANENT: Pipedrive uses apiToken, not apiKey
      },
      nodeTypes: ['pipedrive'],
      description: 'Interact with Pipedrive CRM via API token',
    });

    // ============================================
    // ZOHO CRM CONNECTOR
    // ============================================
    this.register({
      id: 'zoho_crm',
      provider: 'zoho',
      service: 'crm',
      capabilities: [
        'crm.read',
        'crm.write',
        'zoho.record',
      ],
      keywords: ['zoho', 'zoho crm'],
      credentialContract: {
        provider: 'zoho',
        type: 'oauth',
        scopes: ['ZohoCRM.modules.ALL'],
        vaultKey: 'zoho',
        displayName: 'Zoho CRM OAuth',
        required: true,
      },
      nodeTypes: ['zoho_crm'],
      description: 'Interact with Zoho CRM via OAuth',
    });

    // ============================================
    // TWITTER CONNECTOR
    // ============================================
    this.register({
      id: 'twitter_oauth',
      provider: 'twitter',
      service: 'twitter',
      capabilities: [
        'social.post',
        'twitter.post',
        'twitter.tweet',
      ],
      keywords: ['twitter', 'tweet', 'x.com', 'post to twitter'],
      credentialContract: {
        provider: 'twitter',
        type: 'oauth',
        scopes: ['tweet.read', 'tweet.write', 'users.read'],
        vaultKey: 'twitter',
        displayName: 'Twitter OAuth',
        required: true,
      },
      nodeTypes: ['twitter'],
      description: 'Post tweets to Twitter/X via OAuth',
    });

    // ============================================
    // INSTAGRAM CONNECTOR
    // ============================================
    this.register({
      id: 'instagram_oauth',
      provider: 'instagram',
      service: 'instagram',
      capabilities: [
        'social.post',
        'instagram.post',
        'instagram.media',
      ],
      keywords: ['instagram', 'insta', 'post to instagram', 'ig'],
      credentialContract: {
        provider: 'instagram',
        type: 'oauth',
        scopes: ['instagram_basic', 'instagram_content_publish'],
        vaultKey: 'instagram',
        displayName: 'Instagram OAuth',
        required: true,
      },
      nodeTypes: ['instagram'],
      description: 'Post content to Instagram via OAuth',
    });

    // ============================================
    // YOUTUBE CONNECTOR
    // ============================================
    this.register({
      id: 'youtube_oauth',
      provider: 'youtube',
      service: 'youtube',
      capabilities: [
        'video.upload',
        'video.update',
        'youtube.post',
      ],
      keywords: ['youtube', 'you tube', 'yt', 'upload to youtube'],
      credentialContract: {
        provider: 'youtube',
        type: 'oauth',
        scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
        vaultKey: 'youtube',
        displayName: 'YouTube OAuth',
        required: true,
      },
      nodeTypes: ['youtube'],
      description: 'Upload videos to YouTube via OAuth',
    });

    // ============================================
    // OUTLOOK CONNECTOR
    // ============================================
    this.register({
      id: 'outlook_oauth',
      provider: 'microsoft',
      service: 'outlook',
      capabilities: [
        'email.send',
        'outlook.send',
        'microsoft.mail',
        'email.read',
        'outlook.read',
      ],
      keywords: ['outlook', 'microsoft outlook', 'outlook email', 'send via outlook'],
      credentialContract: {
        provider: 'microsoft',
        type: 'oauth',
        scopes: ['https://graph.microsoft.com/Mail.Send', 'https://graph.microsoft.com/Mail.Read'],
        vaultKey: 'microsoft',
        displayName: 'Microsoft OAuth (Outlook)',
        required: true,
      },
      nodeTypes: ['outlook'],
      description: 'Send/receive emails via Outlook API using OAuth',
    });

    // ============================================
    // FACEBOOK CONNECTOR
    // ============================================
    this.register({
      id: 'facebook_oauth',
      provider: 'facebook',
      service: 'facebook',
      capabilities: [
        'social.post',
        'facebook.post',
        'facebook.page',
      ],
      keywords: ['facebook', 'fb', 'post to facebook'],
      credentialContract: {
        provider: 'facebook',
        type: 'oauth',
        scopes: ['pages_manage_posts', 'pages_read_engagement'],
        vaultKey: 'facebook',
        displayName: 'Facebook OAuth',
        required: true,
      },
      nodeTypes: ['facebook'],
      description: 'Post content to Facebook pages via OAuth',
    });

    // ============================================
    // WHATSAPP CLOUD CONNECTOR
    // ============================================
    this.register({
      id: 'whatsapp_cloud',
      provider: 'whatsapp',
      service: 'whatsapp',
      capabilities: [
        'notification.send',
        'whatsapp.send',
        'message.send',
      ],
      keywords: ['whatsapp', 'whats app'],
      credentialContract: {
        provider: 'whatsapp',
        type: 'api_key',
        vaultKey: 'whatsapp',
        displayName: 'WhatsApp Cloud API Token',
        required: true,
        credentialFieldName: 'apiKey', // ✅ PERMANENT: Data-driven mapping
      },
      nodeTypes: ['whatsapp_cloud'],
      description: 'Send messages via WhatsApp Cloud API',
    });

    // ============================================
    // GITHUB CONNECTOR
    // ============================================
    this.register({
      id: 'github_oauth',
      provider: 'github',
      service: 'github',
      capabilities: [
        'git.manage',
        'github.repo',
        'github.issues',
      ],
      keywords: ['github', 'git hub'],
      credentialContract: {
        provider: 'github',
        type: 'oauth',
        scopes: ['repo', 'workflow'],
        vaultKey: 'github',
        displayName: 'GitHub OAuth',
        required: true,
      },
      nodeTypes: ['github'],
      description: 'GitHub repository operations via OAuth',
    });

    // ============================================
    // GOOGLE CALENDAR CONNECTOR
    // ============================================
    this.register({
      id: 'google_calendar',
      provider: 'google',
      service: 'calendar',
      capabilities: [
        'calendar.read',
        'calendar.write',
        'calendar.event',
        'google.calendar',
      ],
      keywords: ['google calendar', 'calendar', 'google cal'],
      credentialContract: {
        provider: 'google',
        type: 'oauth',
        scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
        vaultKey: 'google',
        displayName: 'Google OAuth (Calendar)',
        required: true,
      },
      nodeTypes: ['google_calendar'],
      description: 'Read/write Google Calendar events via OAuth',
    });

    // ============================================
    // GOOGLE DRIVE CONNECTOR
    // ============================================
    this.register({
      id: 'google_drive',
      provider: 'google',
      service: 'drive',
      capabilities: [
        'file.read',
        'file.write',
        'drive.read',
        'drive.write',
        'google.drive',
      ],
      keywords: ['google drive', 'drive', 'google file'],
      credentialContract: {
        provider: 'google',
        type: 'oauth',
        scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive'],
        vaultKey: 'google',
        displayName: 'Google OAuth (Drive)',
        required: true,
      },
      nodeTypes: ['google_drive'],
      description: 'Read/write Google Drive files via OAuth',
    });

    // ============================================
    // GOOGLE CONTACTS CONNECTOR
    // ============================================
    this.register({
      id: 'google_contacts',
      provider: 'google',
      service: 'contacts',
      capabilities: [
        'contacts.read',
        'contacts.write',
        'google.contacts',
      ],
      keywords: ['google contacts', 'contacts', 'google contact'],
      credentialContract: {
        provider: 'google',
        type: 'oauth',
        scopes: ['https://www.googleapis.com/auth/contacts.readonly', 'https://www.googleapis.com/auth/contacts'],
        vaultKey: 'google',
        displayName: 'Google OAuth (Contacts)',
        required: true,
      },
      nodeTypes: ['google_contacts'],
      description: 'Read/write Google Contacts via OAuth',
    });

    // ============================================
    // GOOGLE TASKS CONNECTOR
    // ============================================
    this.register({
      id: 'google_tasks',
      provider: 'google',
      service: 'tasks',
      capabilities: [
        'tasks.read',
        'tasks.write',
        'google.tasks',
      ],
      keywords: ['google tasks', 'tasks', 'google task'],
      credentialContract: {
        provider: 'google',
        type: 'oauth',
        scopes: ['https://www.googleapis.com/auth/tasks', 'https://www.googleapis.com/auth/tasks.readonly'],
        vaultKey: 'google',
        displayName: 'Google OAuth (Tasks)',
        required: true,
      },
      nodeTypes: ['google_tasks'],
      description: 'Read/write Google Tasks via OAuth',
    });

    // ============================================
    // GOOGLE BIGQUERY CONNECTOR
    // ============================================
    this.register({
      id: 'google_bigquery',
      provider: 'google',
      service: 'bigquery',
      capabilities: [
        'database.query',
        'bigquery.query',
        'google.bigquery',
      ],
      keywords: ['google bigquery', 'bigquery', 'big query', 'google bq'],
      credentialContract: {
        provider: 'google',
        type: 'oauth',
        scopes: ['https://www.googleapis.com/auth/bigquery', 'https://www.googleapis.com/auth/bigquery.readonly'],
        vaultKey: 'google',
        displayName: 'Google OAuth (BigQuery)',
        required: true,
      },
      nodeTypes: ['google_bigquery'],
      description: 'Query Google BigQuery via OAuth',
    });

    // ============================================
    // POSTGRESQL CONNECTOR
    // ============================================
    this.register({
      id: 'postgresql',
      provider: 'postgresql',
      service: 'database',
      capabilities: [
        'database.read',
        'database.write',
        'database.query',
        'postgresql.query',
      ],
      keywords: ['postgresql', 'postgres', 'pg'],
      credentialContract: {
        provider: 'postgresql',
        type: 'runtime',
        vaultKey: 'postgresql',
        displayName: 'PostgreSQL Connection String',
        required: true,
      },
      nodeTypes: ['postgresql'],
      description: 'Connect to PostgreSQL database via connection string',
    });

    // ============================================
    // MYSQL CONNECTOR
    // ============================================
    this.register({
      id: 'mysql',
      provider: 'mysql',
      service: 'database',
      capabilities: [
        'database.read',
        'database.write',
        'database.query',
        'mysql.query',
      ],
      keywords: ['mysql', 'my sql'],
      credentialContract: {
        provider: 'mysql',
        type: 'runtime',
        vaultKey: 'mysql',
        displayName: 'MySQL Connection String',
        required: true,
      },
      nodeTypes: ['mysql'],
      description: 'Connect to MySQL database via connection string',
    });

    // ============================================
    // MONGODB CONNECTOR
    // ============================================
    this.register({
      id: 'mongodb',
      provider: 'mongodb',
      service: 'database',
      capabilities: [
        'database.read',
        'database.write',
        'database.query',
        'mongodb.query',
      ],
      keywords: ['mongodb', 'mongo', 'mongo db'],
      credentialContract: {
        provider: 'mongodb',
        type: 'runtime',
        vaultKey: 'mongodb',
        displayName: 'MongoDB Connection String',
        required: true,
      },
      nodeTypes: ['mongodb'],
      description: 'Connect to MongoDB database via connection string',
    });

    // ============================================
    // REDIS CONNECTOR
    // ============================================
    this.register({
      id: 'redis',
      provider: 'redis',
      service: 'cache',
      capabilities: [
        'cache.read',
        'cache.write',
        'redis.get',
        'redis.set',
      ],
      keywords: ['redis', 'cache'],
      credentialContract: {
        provider: 'redis',
        type: 'runtime',
        vaultKey: 'redis',
        displayName: 'Redis Connection String',
        required: true,
      },
      nodeTypes: ['redis'],
      description: 'Connect to Redis cache via connection string',
    });

    // ============================================
    // SUPABASE CONNECTOR
    // ============================================
    this.register({
      id: 'supabase',
      provider: 'supabase',
      service: 'database',
      capabilities: [
        'database.read',
        'database.write',
        'database.query',
        'supabase.query',
      ],
      keywords: ['supabase', 'supa base'],
      credentialContract: {
        provider: 'supabase',
        type: 'api_key',
        vaultKey: 'supabase',
        displayName: 'Supabase API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['supabase'],
      description: 'Connect to Supabase database via API key',
    });

    // ============================================
    // STRIPE CONNECTOR
    // ============================================
    this.register({
      id: 'stripe',
      provider: 'stripe',
      service: 'payment',
      capabilities: [
        'payment.process',
        'stripe.charge',
        'stripe.subscription',
      ],
      keywords: ['stripe', 'payment', 'credit card', 'charge'],
      credentialContract: {
        provider: 'stripe',
        type: 'api_key',
        vaultKey: 'stripe',
        displayName: 'Stripe API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['stripe'],
      description: 'Process payments via Stripe API',
    });

    // ============================================
    // SHOPIFY CONNECTOR
    // ============================================
    this.register({
      id: 'shopify',
      provider: 'shopify',
      service: 'ecommerce',
      capabilities: [
        'ecommerce.read',
        'ecommerce.write',
        'shopify.order',
        'shopify.product',
      ],
      keywords: ['shopify', 'shop ify', 'ecommerce'],
      credentialContract: {
        provider: 'shopify',
        type: 'api_key',
        vaultKey: 'shopify',
        displayName: 'Shopify API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['shopify'],
      description: 'Interact with Shopify store via API key',
    });

    // ============================================
    // WOOCOMMERCE CONNECTOR
    // ============================================
    this.register({
      id: 'woocommerce',
      provider: 'woocommerce',
      service: 'ecommerce',
      capabilities: [
        'ecommerce.read',
        'ecommerce.write',
        'woocommerce.order',
        'woocommerce.product',
      ],
      keywords: ['woocommerce', 'woo commerce', 'woocom'],
      credentialContract: {
        provider: 'woocommerce',
        type: 'api_key',
        vaultKey: 'woocommerce',
        displayName: 'WooCommerce API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['woocommerce'],
      description: 'Interact with WooCommerce store via API key',
    });

    // ============================================
    // PAYPAL CONNECTOR
    // ============================================
    this.register({
      id: 'paypal',
      provider: 'paypal',
      service: 'payment',
      capabilities: [
        'payment.process',
        'paypal.payment',
      ],
      keywords: ['paypal', 'pay pal'],
      credentialContract: {
        provider: 'paypal',
        type: 'oauth',
        scopes: ['https://uri.paypal.com/services/payments'],
        vaultKey: 'paypal',
        displayName: 'PayPal OAuth',
        required: true,
      },
      nodeTypes: ['paypal'],
      description: 'Process payments via PayPal OAuth',
    });

    // ============================================
    // TWILIO CONNECTOR
    // ============================================
    this.register({
      id: 'twilio',
      provider: 'twilio',
      service: 'sms',
      capabilities: [
        'sms.send',
        'twilio.sms',
        'message.send',
      ],
      keywords: ['twilio', 'sms', 'text message'],
      credentialContract: {
        provider: 'twilio',
        type: 'api_key',
        vaultKey: 'twilio',
        displayName: 'Twilio API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['twilio'],
      description: 'Send SMS messages via Twilio API',
    });

    // ============================================
    // MICROSOFT TEAMS CONNECTOR
    // ============================================
    this.register({
      id: 'microsoft_teams',
      provider: 'microsoft',
      service: 'teams',
      capabilities: [
        'notification.send',
        'teams.send',
        'message.send',
      ],
      keywords: ['microsoft teams', 'teams', 'ms teams'],
      credentialContract: {
        provider: 'microsoft',
        type: 'webhook',
        vaultKey: 'microsoft',
        displayName: 'Microsoft Teams Webhook URL',
        required: true,
        credentialFieldName: 'webhookUrl',
      },
      nodeTypes: ['microsoft_teams'],
      description: 'Send messages to Microsoft Teams via webhook',
    });

    // ============================================
    // GITLAB CONNECTOR
    // ============================================
    this.register({
      id: 'gitlab',
      provider: 'gitlab',
      service: 'git',
      capabilities: [
        'git.manage',
        'gitlab.repo',
        'gitlab.issues',
      ],
      keywords: ['gitlab', 'git lab'],
      credentialContract: {
        provider: 'gitlab',
        type: 'oauth',
        scopes: ['api', 'read_repository', 'write_repository'],
        vaultKey: 'gitlab',
        displayName: 'GitLab OAuth',
        required: true,
      },
      nodeTypes: ['gitlab'],
      description: 'GitLab repository operations via OAuth',
    });

    // ============================================
    // BITBUCKET CONNECTOR
    // ============================================
    this.register({
      id: 'bitbucket',
      provider: 'bitbucket',
      service: 'git',
      capabilities: [
        'git.manage',
        'bitbucket.repo',
        'bitbucket.issues',
      ],
      keywords: ['bitbucket', 'bit bucket'],
      credentialContract: {
        provider: 'bitbucket',
        type: 'oauth',
        scopes: ['repository:write', 'repository:read'],
        vaultKey: 'bitbucket',
        displayName: 'Bitbucket OAuth',
        required: true,
      },
      nodeTypes: ['bitbucket'],
      description: 'Bitbucket repository operations via OAuth',
    });

    // ============================================
    // JIRA CONNECTOR
    // ============================================
    this.register({
      id: 'jira',
      provider: 'jira',
      service: 'project',
      capabilities: [
        'project.manage',
        'jira.issue',
        'jira.project',
      ],
      keywords: ['jira'],
      credentialContract: {
        provider: 'jira',
        type: 'api_key',
        vaultKey: 'jira',
        displayName: 'Jira API Token',
        required: true,
        credentialFieldName: 'apiToken',
      },
      nodeTypes: ['jira'],
      description: 'Interact with Jira via API token',
    });

    // ============================================
    // JENKINS CONNECTOR
    // ============================================
    this.register({
      id: 'jenkins',
      provider: 'jenkins',
      service: 'ci_cd',
      capabilities: [
        'ci_cd.trigger',
        'jenkins.build',
      ],
      keywords: ['jenkins'],
      credentialContract: {
        provider: 'jenkins',
        type: 'api_key',
        vaultKey: 'jenkins',
        displayName: 'Jenkins API Token',
        required: true,
        credentialFieldName: 'apiToken',
      },
      nodeTypes: ['jenkins'],
      description: 'Trigger Jenkins builds via API token',
    });

    // ============================================
    // AWS S3 CONNECTOR
    // ============================================
    this.register({
      id: 'aws_s3',
      provider: 'aws',
      service: 's3',
      capabilities: [
        'file.read',
        'file.write',
        's3.upload',
        's3.download',
      ],
      keywords: ['aws s3', 's3', 'amazon s3', 'aws storage'],
      credentialContract: {
        provider: 'aws',
        type: 'api_key',
        vaultKey: 'aws',
        displayName: 'AWS Access Key',
        required: true,
        credentialFieldName: 'accessKeyId',
      },
      nodeTypes: ['aws_s3'],
      description: 'Read/write files to AWS S3 via access key',
    });

    // ============================================
    // DROPBOX CONNECTOR
    // ============================================
    this.register({
      id: 'dropbox',
      provider: 'dropbox',
      service: 'storage',
      capabilities: [
        'file.read',
        'file.write',
        'dropbox.upload',
        'dropbox.download',
      ],
      keywords: ['dropbox', 'drop box'],
      credentialContract: {
        provider: 'dropbox',
        type: 'oauth',
        scopes: ['files.content.read', 'files.content.write'],
        vaultKey: 'dropbox',
        displayName: 'Dropbox OAuth',
        required: true,
      },
      nodeTypes: ['dropbox'],
      description: 'Read/write files to Dropbox via OAuth',
    });

    // ============================================
    // ONEDRIVE CONNECTOR
    // ============================================
    this.register({
      id: 'onedrive',
      provider: 'microsoft',
      service: 'onedrive',
      capabilities: [
        'file.read',
        'file.write',
        'onedrive.upload',
        'onedrive.download',
      ],
      keywords: ['onedrive', 'one drive', 'microsoft onedrive'],
      credentialContract: {
        provider: 'microsoft',
        type: 'oauth',
        scopes: ['Files.ReadWrite', 'Files.ReadWrite.All'],
        vaultKey: 'microsoft',
        displayName: 'Microsoft OAuth (OneDrive)',
        required: true,
      },
      nodeTypes: ['onedrive'],
      description: 'Read/write files to OneDrive via OAuth',
    });

    // ============================================
    // FRESHDESK CONNECTOR
    // ============================================
    this.register({
      id: 'freshdesk',
      provider: 'freshdesk',
      service: 'support',
      capabilities: [
        'support.ticket',
        'freshdesk.ticket',
        'customer.support',
      ],
      keywords: ['freshdesk', 'fresh desk', 'support ticket'],
      credentialContract: {
        provider: 'freshdesk',
        type: 'api_key',
        vaultKey: 'freshdesk',
        displayName: 'Freshdesk API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['freshdesk'],
      description: 'Interact with Freshdesk support tickets via API key',
    });

    // ============================================
    // INTERCOM CONNECTOR
    // ============================================
    this.register({
      id: 'intercom',
      provider: 'intercom',
      service: 'support',
      capabilities: [
        'support.message',
        'intercom.message',
        'customer.message',
      ],
      keywords: ['intercom', 'inter com'],
      credentialContract: {
        provider: 'intercom',
        type: 'oauth',
        scopes: ['read', 'write'],
        vaultKey: 'intercom',
        displayName: 'Intercom OAuth',
        required: true,
      },
      nodeTypes: ['intercom'],
      description: 'Send messages via Intercom OAuth',
    });

    // ============================================
    // MAILCHIMP CONNECTOR
    // ============================================
    this.register({
      id: 'mailchimp',
      provider: 'mailchimp',
      service: 'email_marketing',
      capabilities: [
        'email.campaign',
        'mailchimp.campaign',
        'email.marketing',
      ],
      keywords: ['mailchimp', 'mail chimp', 'email marketing'],
      credentialContract: {
        provider: 'mailchimp',
        type: 'api_key',
        vaultKey: 'mailchimp',
        displayName: 'Mailchimp API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['mailchimp'],
      description: 'Manage Mailchimp email campaigns via API key',
    });

    // ============================================
    // ACTIVECAMPAIGN CONNECTOR
    // ============================================
    this.register({
      id: 'activecampaign',
      provider: 'activecampaign',
      service: 'email_marketing',
      capabilities: [
        'email.campaign',
        'activecampaign.campaign',
        'email.automation',
      ],
      keywords: ['activecampaign', 'active campaign'],
      credentialContract: {
        provider: 'activecampaign',
        type: 'api_key',
        vaultKey: 'activecampaign',
        displayName: 'ActiveCampaign API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['activecampaign'],
      description: 'Manage ActiveCampaign email campaigns via API key',
    });

    // ============================================
    // OPENAI GPT CONNECTOR
    // ============================================
    this.register({
      id: 'openai_gpt',
      provider: 'openai',
      service: 'ai',
      capabilities: [
        'ai.chat',
        'openai.chat',
        'gpt.chat',
      ],
      keywords: ['openai', 'gpt', 'chatgpt', 'open ai'],
      credentialContract: {
        provider: 'openai',
        type: 'api_key',
        vaultKey: 'openai',
        displayName: 'OpenAI API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['openai_gpt'],
      description: 'Use OpenAI GPT models via API key',
    });

    // ============================================
    // ANTHROPIC CLAUDE CONNECTOR
    // ============================================
    this.register({
      id: 'anthropic_claude',
      provider: 'anthropic',
      service: 'ai',
      capabilities: [
        'ai.chat',
        'claude.chat',
        'anthropic.chat',
      ],
      keywords: ['anthropic', 'claude', 'anthropic claude'],
      credentialContract: {
        provider: 'anthropic',
        type: 'api_key',
        vaultKey: 'anthropic',
        displayName: 'Anthropic API Key',
        required: true,
        credentialFieldName: 'apiKey',
      },
      nodeTypes: ['anthropic_claude'],
      description: 'Use Anthropic Claude models via API key',
    });

    // ============================================
    // OLLAMA CONNECTOR
    // ============================================
    this.register({
      id: 'ollama',
      provider: 'ollama',
      service: 'ai',
      capabilities: [
        'ai.chat',
        'ollama.chat',
        'local.ai',
      ],
      keywords: ['ollama', 'local ai', 'ollama ai'],
      credentialContract: {
        provider: 'ollama',
        type: 'runtime',
        vaultKey: 'ollama',
        displayName: 'Ollama Base URL',
        required: false, // Ollama can run locally without credentials
      },
      nodeTypes: ['ollama'],
      description: 'Use Ollama local AI models (no credentials required for local)',
    });

    // ============================================
    // FTP CONNECTOR
    // ============================================
    this.register({
      id: 'ftp',
      provider: 'ftp',
      service: 'file_transfer',
      capabilities: [
        'file.upload',
        'file.download',
        'ftp.transfer',
      ],
      keywords: ['ftp', 'file transfer protocol'],
      credentialContract: {
        provider: 'ftp',
        type: 'basic_auth',
        vaultKey: 'ftp',
        displayName: 'FTP Credentials',
        required: true,
      },
      nodeTypes: ['ftp'],
      description: 'Transfer files via FTP using basic authentication',
    });

    // ============================================
    // SFTP CONNECTOR
    // ============================================
    this.register({
      id: 'sftp',
      provider: 'sftp',
      service: 'file_transfer',
      capabilities: [
        'file.upload',
        'file.download',
        'sftp.transfer',
      ],
      keywords: ['sftp', 'secure ftp', 'ssh ftp'],
      credentialContract: {
        provider: 'sftp',
        type: 'basic_auth',
        vaultKey: 'sftp',
        displayName: 'SFTP Credentials',
        required: true,
      },
      nodeTypes: ['sftp'],
      description: 'Transfer files via SFTP using SSH authentication',
    });
  }

  /**
   * Register a connector
   */
  private register(connector: Connector): void {
    // Validate connector
    if (!connector.id || !connector.provider || !connector.service) {
      throw new Error(`Invalid connector: ${JSON.stringify(connector)}`);
    }

    // Ensure no duplicate IDs
    if (this.connectors.has(connector.id)) {
      throw new Error(`Connector ${connector.id} is already registered`);
    }

    this.connectors.set(connector.id, connector);
  }

  /**
   * Get connector by ID
   */
  getConnector(connectorId: string): Connector | undefined {
    return this.connectors.get(connectorId);
  }

  /**
   * Get connector by node type
   */
  getConnectorByNodeType(nodeType: string): Connector | undefined {
    for (const connector of this.connectors.values()) {
      if (connector.nodeTypes.includes(nodeType)) {
        return connector;
      }
    }
    return undefined;
  }

  /**
   * Get all connectors
   */
  getAllConnectors(): Connector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Get connectors by capability
   */
  getConnectorsByCapability(capability: string): Connector[] {
    return Array.from(this.connectors.values()).filter(
      connector => connector.capabilities.includes(capability)
    );
  }

  /**
   * Get connectors by provider
   */
  getConnectorsByProvider(provider: string): Connector[] {
    return Array.from(this.connectors.values()).filter(
      connector => connector.provider === provider
    );
  }

  /**
   * Find connectors matching keywords
   */
  findConnectorsByKeywords(keywords: string[]): Connector[] {
    const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
    return Array.from(this.connectors.values()).filter(connector => {
      return connector.keywords.some(keyword => 
        keywordSet.has(keyword.toLowerCase())
      );
    });
  }

  /**
   * Validate that no two connectors share credentials
   * This ensures strict isolation
   */
  validateIsolation(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const credentialMap = new Map<string, string[]>(); // credential key -> connector IDs

    for (const connector of this.connectors.values()) {
      const key = `${connector.credentialContract.provider}_${connector.credentialContract.type}`;
      
      if (!credentialMap.has(key)) {
        credentialMap.set(key, []);
      }
      
      credentialMap.get(key)!.push(connector.id);
    }

    // Check for shared credentials (this is allowed for same provider, but not across different providers)
    for (const [key, connectorIds] of credentialMap.entries()) {
      if (connectorIds.length > 1) {
        // Check if they're from the same provider
        const connectors = connectorIds.map(id => this.getConnector(id)!);
        const providers = new Set(connectors.map(c => c.provider));
        
        if (providers.size > 1) {
          errors.push(
            `Credential ${key} is shared across different providers: ${connectorIds.join(', ')}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Singleton instance
export const connectorRegistry = new ConnectorRegistry();

// Validate on load
const validation = connectorRegistry.validateIsolation();
if (!validation.valid) {
  console.error('[ConnectorRegistry] Validation failed:', validation.errors);
  throw new Error(`Connector registry validation failed: ${validation.errors.join('; ')}`);
}
