import type {
  CredentialFieldGuide,
  CredentialFieldSchema,
  CredentialGuide,
  CredentialTypeDefinition,
} from './types';

const providerBase = process.env.PUBLIC_WORKER_URL || process.env.WORKER_PUBLIC_URL || 'http://localhost:3001';

function csvEnv(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function optionalAuthParam(name: string, value: string | undefined): Record<string, string> {
  return value ? { [name]: value } : {};
}

const facebookBusinessConfigId =
  process.env.META_FACEBOOK_CONFIG_ID ||
  process.env.FACEBOOK_CONFIG_ID ||
  '';

const facebookOAuthScopes = Array.from(new Set([
  'public_profile',
  'email',
  'pages_show_list',
  ...csvEnv('META_FACEBOOK_EXTRA_SCOPES'),
  ...csvEnv('FACEBOOK_EXTRA_SCOPES'),
]));

type CredentialTypeDefinitionInput = Omit<CredentialTypeDefinition, 'guide' | 'inputFields'> & {
  inputFields: CredentialFieldSchema[];
  guide?: Partial<CredentialGuide>;
};

const providerDocsUrls: Record<string, string> = {
  activecampaign: 'https://developers.activecampaign.com/',
  airtable: 'https://airtable.com/developers/web/api/authentication',
  anthropic: 'https://docs.anthropic.com/',
  asana: 'https://developers.asana.com/docs/personal-access-token',
  aws: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
  bitbucket: 'https://support.atlassian.com/bitbucket-cloud/docs/app-passwords/',
  calendly: 'https://developer.calendly.com/',
  clickup: 'https://developer.clickup.com/docs/authentication',
  cloudflare: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/',
  cohere: 'https://docs.cohere.com/',
  discord: 'https://discord.com/developers/docs/intro',
  dropbox: 'https://www.dropbox.com/developers/documentation',
  facebook: 'https://developers.facebook.com/docs/facebook-login/',
  firebase: 'https://firebase.google.com/docs/projects/api-keys',
  freshdesk: 'https://developers.freshdesk.com/api/',
  github: 'https://docs.github.com/en/authentication',
  gitlab: 'https://docs.gitlab.com/user/profile/personal_access_tokens/',
  google: 'https://developers.google.com/identity/protocols/oauth2',
  huggingface: 'https://huggingface.co/docs/hub/security-tokens',
  hubspot: 'https://developers.hubspot.com/docs/api/oauth-quickstart-guide',
  instagram: 'https://developers.facebook.com/docs/instagram-platform/',
  intercom: 'https://developers.intercom.com/docs/build-an-integration/learn-more/authentication',
  jira: 'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
  linear: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api',
  mailchimp: 'https://mailchimp.com/developer/marketing/guides/quick-start/',
  mailgun: 'https://documentation.mailgun.com/docs/mailgun/api-reference/authentication',
  microsoft: 'https://learn.microsoft.com/graph/auth/',
  mistral: 'https://docs.mistral.ai/',
  monday: 'https://developer.monday.com/api-reference/docs/authentication',
  mongodb: 'https://www.mongodb.com/docs/manual/reference/connection-string/',
  notion: 'https://developers.notion.com/docs/authorization',
  openai: 'https://platform.openai.com/api-keys',
  paypal: 'https://developer.paypal.com/api/rest/authentication/',
  pinecone: 'https://docs.pinecone.io/guides/projects/manage-api-keys',
  pipedrive: 'https://developers.pipedrive.com/docs/api/v1',
  qdrant: 'https://qdrant.tech/documentation/cloud/authentication/',
  quickbooks: 'https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization',
  salesforce: 'https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_flows.htm',
  sendgrid: 'https://docs.sendgrid.com/ui/account-and-settings/api-keys',
  shopify: 'https://shopify.dev/docs/apps/build/authentication-authorization',
  slack: 'https://api.slack.com/authentication',
  stripe: 'https://docs.stripe.com/keys',
  db: 'https://db.com/docs/guides/api/api-keys',
  telegram: 'https://core.telegram.org/bots/features#botfather',
  trello: 'https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/',
  twilio: 'https://www.twilio.com/docs/iam/keys/api-key',
  twitter: 'https://developer.x.com/en/docs/authentication/oauth-2-0',
  typeform: 'https://www.typeform.com/developers/get-started/personal-access-token/',
  whatsapp: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
  woocommerce: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
  xero: 'https://developer.xero.com/documentation/guides/oauth2/overview',
  youtube: 'https://developers.google.com/youtube/v3/guides/authentication',
  zendesk: 'https://developer.zendesk.com/api-reference/introduction/security-and-auth/',
  zoho: 'https://www.zoho.com/crm/developer/docs/api/v2/oauth-overview.html',
};

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function providerLabel(provider: string): string {
  if (provider === 'aws') return 'AWS';
  if (provider === 'qdrant') return 'Qdrant';
  if (provider === 'github') return 'GitHub';
  if (provider === 'gitlab') return 'GitLab';
  if (provider === 'mysql') return 'MySQL';
  if (provider === 'sftp') return 'SFTP';
  if (provider === 'ftp') return 'FTP';
  return titleCase(provider);
}

function inferFieldLocation(field: CredentialFieldSchema, definition: CredentialTypeDefinitionInput): string {
  if (field.helpText) return field.helpText;

  const name = field.name.toLowerCase();
  const service = providerLabel(definition.provider);

  if (name.includes('host')) return `Find this in your ${service} server, database, or hosting provider connection details.`;
  if (name.includes('port')) return `Use the port shown in your ${service} connection details. If no custom port is listed, use the default shown in this form.`;
  if (name.includes('database')) return `Use the exact database name created in your ${service} server or cloud console.`;
  if (name.includes('username') || name === 'user') return `Use the ${service} account, database user, or integration username that has permission for this workflow.`;
  if (name.includes('password')) return `Use the password, app password, or generated credential for the selected ${service} user.`;
  if (name.includes('privatekey')) return `Use the PEM private key from your SSH key pair or server access settings.`;
  if (name.includes('serviceaccount')) return `Use the service account JSON downloaded from the project service account settings.`;
  if (name.includes('url') || name.includes('domain') || name.includes('subdomain')) return `Copy this from your ${service} account URL, API base URL, or project settings.`;
  if (name.includes('project')) return `Copy this from the ${service} project settings or project overview page.`;
  if (name.includes('region')) return `Choose the region where your ${service} account or resource is hosted.`;
  if (name.includes('secret')) return `Create or reveal this in the ${service} developer, API, or integration settings page.`;
  if (name.includes('token')) return `Create this in the ${service} developer, security, API, or personal access token settings page.`;
  if (name.includes('apikey') || name.includes('api_key') || name.includes('key')) return `Create or copy this from the ${service} API keys, developer, or integration settings page.`;
  if (name.includes('sid')) return `Copy this identifier from your ${service} project or account dashboard.`;
  if (name.includes('account') || name.includes('workspace')) return `Copy this from your ${service} account, workspace, or organization settings.`;
  if (name.includes('header')) return 'Use the exact HTTP header name and value required by the API you are connecting.';
  if (name.includes('query')) return 'Use the exact query parameter name and value required by the API you are connecting.';

  return `Find this value in your ${service} account settings, developer console, or integration setup page.`;
}

function buildFieldGuide(field: CredentialFieldSchema, definition: CredentialTypeDefinitionInput): CredentialFieldGuide {
  const example =
    !field.secret && field.placeholder
      ? field.placeholder
      : field.defaultValue !== undefined
        ? String(field.defaultValue)
        : undefined;

  return {
    label: field.label,
    description: `${field.label} is used to authenticate or route requests for ${definition.displayName}.`,
    whereToFind: inferFieldLocation(field, definition),
    example,
    notes: [
      field.required ? 'Required before this connection can be saved.' : 'Optional unless your account setup requires it.',
      field.secret ? 'Stored encrypted and masked after saving.' : 'Use the exact spelling and casing from the source system.',
      ...(field.options?.length ? [`Choose one of: ${field.options.map((option) => option.label).join(', ')}.`] : []),
    ],
  };
}

function buildGuide(definition: CredentialTypeDefinitionInput): CredentialGuide {
  const service = providerLabel(definition.provider);
  const isOAuth = definition.authType === 'oauth2';
  const fieldGuides = Object.fromEntries(
    definition.inputFields.map((field) => [
      field.name,
      field.guide || buildFieldGuide(field, definition),
    ]),
  );

  return {
    summary: isOAuth
      ? `Connect ${service} with OAuth so CtrlChecks can request permission without asking you to paste secret tokens.`
      : `Use this guide to collect the ${definition.displayName} values required to create a reusable CtrlChecks connection.`,
    prerequisites: isOAuth
      ? [
          `An active ${service} account you can sign in to.`,
          'Permission to approve the requested scopes for your workspace or account.',
          'Popups and redirects allowed for this CtrlChecks session.',
        ]
      : [
          `Access to the ${service} account, developer console, admin settings, or server connection details.`,
          'Permission to create or view API credentials for the account.',
          'A least-privilege credential dedicated to automation when the provider supports it.',
        ],
    steps: isOAuth
      ? [
          `Click ${definition.form.oauthButtonLabel || `Connect ${service}`}.`,
          `Sign in to ${service} in the authorization window.`,
          'Review the requested permissions and approve only if they match this workflow.',
          'Return to CtrlChecks and confirm the connection appears as connected.',
        ]
      : [
          `Open your ${service} account, developer console, admin settings, or database connection page.`,
          'Create a new API key, token, app password, webhook, or database user when possible.',
          'Copy each value into the matching field in this form.',
          'Save the connection, then test it before using it in production workflows.',
        ],
    fieldGuides,
    securityNotes: [
      'Never paste personal passwords when the provider offers API keys, app passwords, or tokens.',
      'Use the minimum scopes and permissions needed for the workflows that will use this connection.',
      'Rotate the credential immediately if it is shared outside CtrlChecks or exposed in logs.',
      'CtrlChecks stores saved secret fields encrypted and masks them in the UI.',
    ],
    docsUrl: providerDocsUrls[definition.provider],
    ...definition.guide,
  };
}

function addCredentialGuides(definitions: CredentialTypeDefinitionInput[]): CredentialTypeDefinition[] {
  return definitions.map((definition) => {
    const guide = buildGuide(definition);
    return {
      ...definition,
      guide,
      inputFields: definition.inputFields.map((field) => ({
        ...field,
        guide: guide.fieldGuides[field.name] || field.guide || buildFieldGuide(field, definition),
      })),
    };
  });
}

export const credentialTypeDefinitions: CredentialTypeDefinition[] = addCredentialGuides([
  // ─── Google Suite ───────────────────────────────────────────────────────────
  {
    id: 'google_oauth2',
    provider: 'google',
    displayName: 'Google OAuth2',
    authType: 'oauth2',
    requiredScopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/bigquery',
    ],
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Google', testLabel: 'Test Google' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://www.googleapis.com/oauth2/v2/userinfo', successStatus: [200] },
    oauth2: {
      provider: 'google',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
      clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
      clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_GOOGLE_OAUTH_REDIRECT_URI',
      defaultScopes: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/contacts',
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/bigquery',
      ],
      scopeSeparator: ' ',
      accessType: 'offline',
      prompt: 'consent',
      authParams: { include_granted_scopes: 'true' },
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token', 'id_token'],
  },

  // ─── Microsoft Suite ────────────────────────────────────────────────────────
  {
    id: 'microsoft_oauth2',
    provider: 'microsoft',
    displayName: 'Microsoft OAuth2',
    authType: 'oauth2',
    requiredScopes: [
      'offline_access',
      'https://graph.microsoft.com/User.Read',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Calendars.ReadWrite',
      'https://graph.microsoft.com/Team.ReadBasic.All',
      'https://graph.microsoft.com/Channel.ReadBasic.All',
    ],
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Microsoft', testLabel: 'Test Microsoft' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://graph.microsoft.com/v1.0/me', successStatus: [200] },
    oauth2: {
      provider: 'microsoft',
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      clientIdEnv: 'MICROSOFT_CLIENT_ID',
      clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_MICROSOFT_OAUTH_REDIRECT_URI',
      defaultScopes: [
        'offline_access',
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'https://graph.microsoft.com/Team.ReadBasic.All',
        'https://graph.microsoft.com/Channel.ReadBasic.All',
      ],
      scopeSeparator: ' ',
      accessType: 'offline',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token', 'id_token'],
  },

  // ─── Slack ──────────────────────────────────────────────────────────────────
  {
    id: 'slack_oauth2',
    provider: 'slack',
    displayName: 'Slack OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Slack', testLabel: 'Test Slack' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://slack.com/api/auth.test', successStatus: [200] },
    oauth2: {
      provider: 'slack',
      authorizationUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      clientIdEnv: 'SLACK_CLIENT_ID',
      clientSecretEnv: 'SLACK_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_SLACK_OAUTH_REDIRECT_URI',
      defaultScopes: ['chat:write', 'channels:read', 'users:read'],
      scopeSeparator: ',',
    },
    refresh: { enabled: false, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token', 'authed_user'],
  },

  // ─── GitHub ─────────────────────────────────────────────────────────────────
  {
    id: 'github_oauth2',
    provider: 'github',
    displayName: 'GitHub OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect GitHub', testLabel: 'Test GitHub' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://api.github.com/user', successStatus: [200] },
    oauth2: {
      provider: 'github',
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      clientIdEnv: 'GITHUB_CLIENT_ID',
      clientSecretEnv: 'GITHUB_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_GITHUB_OAUTH_REDIRECT_URI',
      defaultScopes: ['read:user', 'user:email', 'repo'],
      scopeSeparator: ' ',
    },
    refresh: { enabled: false, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },
  {
    id: 'github_pat',
    provider: 'github',
    displayName: 'GitHub Personal Access Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at github.com/settings/tokens',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Token' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.github.com/user', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── GitLab ─────────────────────────────────────────────────────────────────
  {
    id: 'gitlab_oauth2',
    provider: 'gitlab',
    displayName: 'GitLab OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect GitLab', testLabel: 'Test GitLab' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://gitlab.com/api/v4/user', successStatus: [200] },
    oauth2: {
      provider: 'gitlab',
      authorizationUrl: 'https://gitlab.com/oauth/authorize',
      tokenUrl: 'https://gitlab.com/oauth/token',
      userInfoUrl: 'https://gitlab.com/api/v4/user',
      clientIdEnv: 'GITLAB_CLIENT_ID',
      clientSecretEnv: 'GITLAB_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_GITLAB_OAUTH_REDIRECT_URI',
      defaultScopes: ['read_user', 'api'],
      scopeSeparator: ' ',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },
  {
    id: 'gitlab_pat',
    provider: 'gitlab',
    displayName: 'GitLab Personal Access Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at gitlab.com/-/user_settings/personal_access_tokens',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Token' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://gitlab.com/api/v4/user', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Notion ─────────────────────────────────────────────────────────────────
  {
    id: 'notion_oauth2',
    provider: 'notion',
    displayName: 'Notion OAuth2',
    authType: 'oauth2',
    requiredScopes: ['read_content', 'update_content', 'insert_content'],
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Notion', testLabel: 'Test Notion' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: {
      method: 'GET',
      url: 'https://api.notion.com/v1/users/me',
      headers: { 'Notion-Version': '2022-06-28' },
      successStatus: [200],
    },
    oauth2: {
      provider: 'notion',
      authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      clientIdEnv: 'NOTION_OAUTH_CLIENT_ID',
      clientSecretEnv: 'NOTION_OAUTH_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_NOTION_OAUTH_REDIRECT_URI',
      defaultScopes: ['read_content', 'update_content', 'insert_content'],
      tokenAuthMethod: 'basic',
    },
    refresh: { enabled: false, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'bot_id', 'workspace_id'],
  },
  {
    id: 'notion_api_key',
    provider: 'notion',
    displayName: 'Notion Internal Integration Secret',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Internal Integration Secret',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get this from notion.so/my-integrations → Secrets tab',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Secret', testLabel: 'Test Secret' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: {
      method: 'GET',
      url: 'https://api.notion.com/v1/users/me',
      headers: { 'Notion-Version': '2022-06-28' },
      successStatus: [200],
    },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Asana ──────────────────────────────────────────────────────────────────
  {
    id: 'asana_oauth2',
    provider: 'asana',
    displayName: 'Asana OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Asana', testLabel: 'Test Asana' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://app.asana.com/api/1.0/users/me', successStatus: [200] },
    oauth2: {
      provider: 'asana',
      authorizationUrl: 'https://app.asana.com/-/oauth_authorize',
      tokenUrl: 'https://app.asana.com/-/oauth_token',
      clientIdEnv: 'ASANA_CLIENT_ID',
      clientSecretEnv: 'ASANA_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_ASANA_OAUTH_REDIRECT_URI',
      defaultScopes: ['default'],
      scopeSeparator: ' ',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── Jira (Atlassian) ───────────────────────────────────────────────────────
  {
    id: 'jira_api_key',
    provider: 'jira',
    displayName: 'Jira API Token',
    authType: 'basic_auth',
    inputFields: [
      { name: 'username', label: 'Email Address', type: 'text', required: true, placeholder: 'you@company.com' },
      {
        name: 'password',
        label: 'API Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at id.atlassian.com/manage-profile/security/api-tokens',
      },
      {
        name: 'domain',
        label: 'Domain',
        type: 'url',
        required: true,
        placeholder: 'yourcompany.atlassian.net',
        helpText: 'Your Atlassian domain without https://',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Jira' },
    validation: { requiredFields: ['username', 'password', 'domain'] },
    injection: [{ target: 'basic_auth', valueTemplate: '{{username}}:{{password}}' }],
    testRequest: { method: 'GET', url: 'https://{{domain}}/rest/api/3/myself', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['password'],
  },

  // ─── ClickUp ────────────────────────────────────────────────────────────────
  {
    id: 'clickup_api_token',
    provider: 'clickup',
    displayName: 'ClickUp API Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'apiToken',
        label: 'Personal API Token',
        type: 'password',
        required: true,
        secret: true,
        placeholder: 'pk_...',
        helpText: 'Find it at ClickUp Settings → Apps → API Token (starts with pk_)',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Connection', testLabel: 'Test ClickUp' },
    validation: { requiredFields: ['apiToken'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: '{{apiToken}}' }],
    testRequest: { method: 'GET', url: 'https://api.clickup.com/api/v2/user', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiToken'],
  },
  {
    id: 'clickup_oauth2',
    provider: 'clickup',
    displayName: 'ClickUp OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect ClickUp', testLabel: 'Test ClickUp' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://api.clickup.com/api/v2/user', successStatus: [200] },
    oauth2: {
      provider: 'clickup',
      authorizationUrl: 'https://app.clickup.com/api',
      tokenUrl: 'https://api.clickup.com/api/v2/oauth/token',
      clientIdEnv: 'CLICKUP_CLIENT_ID',
      clientSecretEnv: 'CLICKUP_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_CLICKUP_OAUTH_REDIRECT_URI',
      defaultScopes: [],
      scopeSeparator: ' ',
    },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── Monday.com ─────────────────────────────────────────────────────────────
  {
    id: 'monday_token',
    provider: 'monday',
    displayName: 'Monday.com API Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'API Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from monday.com → Profile → Admin → API',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Monday.com' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: {
      method: 'POST',
      url: 'https://api.monday.com/v2',
      headers: { 'Content-Type': 'application/json' },
      body: { query: '{ me { id name } }' },
      successStatus: [200],
    },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Linear ─────────────────────────────────────────────────────────────────
  {
    id: 'linear_oauth2',
    provider: 'linear',
    displayName: 'Linear OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Linear', testLabel: 'Test Linear' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: {
      method: 'POST',
      url: 'https://api.linear.app/graphql',
      headers: { 'Content-Type': 'application/json' },
      body: { query: '{ viewer { id name } }' },
      successStatus: [200],
    },
    oauth2: {
      provider: 'linear',
      authorizationUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
      clientIdEnv: 'LINEAR_CLIENT_ID',
      clientSecretEnv: 'LINEAR_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_LINEAR_OAUTH_REDIRECT_URI',
      defaultScopes: ['read', 'write'],
      scopeSeparator: ',',
    },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['access_token', 'refresh_token'],
  },
  {
    id: 'linear_api_key',
    provider: 'linear',
    displayName: 'Linear Personal API Key',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Personal API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at linear.app/settings/api → Personal API Keys',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Key', testLabel: 'Test Linear' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Trello ─────────────────────────────────────────────────────────────────
  {
    id: 'trello_api_key',
    provider: 'trello',
    displayName: 'Trello API Key & Token',
    authType: 'query_auth',
    inputFields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from trello.com/power-ups/admin → API Key',
      },
      {
        name: 'token',
        label: 'API Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Generated from the API Key page → Token link',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Trello' },
    validation: { requiredFields: ['apiKey', 'token'] },
    injection: [
      { target: 'query', name: 'key', valueTemplate: '{{apiKey}}' },
      { target: 'query', name: 'token', valueTemplate: '{{token}}' },
    ],
    testRequest: { method: 'GET', url: 'https://api.trello.com/1/members/me', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiKey', 'token'],
  },

  // ─── HubSpot ────────────────────────────────────────────────────────────────
  {
    id: 'hubspot_oauth2',
    provider: 'hubspot',
    displayName: 'HubSpot OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect HubSpot', testLabel: 'Test HubSpot' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://api.hubapi.com/oauth/v1/access-tokens/{{access_token}}', successStatus: [200] },
    oauth2: {
      provider: 'hubspot',
      authorizationUrl: 'https://app.hubspot.com/oauth/authorize',
      tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
      clientIdEnv: 'HUBSPOT_CLIENT_ID',
      clientSecretEnv: 'HUBSPOT_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_HUBSPOT_OAUTH_REDIRECT_URI',
      defaultScopes: [
        'crm.objects.contacts.read',
        'crm.objects.contacts.write',
        'crm.objects.companies.read',
        'crm.objects.companies.write',
        'crm.objects.deals.read',
        'crm.objects.deals.write',
        'crm.objects.owners.read',
        'tickets',
      ],
      scopeSeparator: ' ',
      pkce: false,
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── Salesforce ─────────────────────────────────────────────────────────────
  {
    id: 'salesforce_oauth2',
    provider: 'salesforce',
    displayName: 'Salesforce OAuth2',
    authType: 'oauth2',
    inputFields: [
      {
        name: 'instanceUrl',
        label: 'Instance URL',
        type: 'url',
        required: false,
        placeholder: 'yourcompany.my.salesforce.com',
        helpText: 'Your Salesforce instance subdomain',
      },
    ],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Salesforce', testLabel: 'Test Salesforce' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://login.salesforce.com/services/oauth2/userinfo', successStatus: [200] },
    oauth2: {
      provider: 'salesforce',
      authorizationUrl: 'https://login.salesforce.com/services/oauth2/authorize',
      tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
      clientIdEnv: 'SALESFORCE_CLIENT_ID',
      clientSecretEnv: 'SALESFORCE_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_SALESFORCE_OAUTH_REDIRECT_URI',
      defaultScopes: ['api', 'refresh_token', 'offline_access'],
      scopeSeparator: ' ',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── Pipedrive ──────────────────────────────────────────────────────────────
  {
    id: 'pipedrive_api_key',
    provider: 'pipedrive',
    displayName: 'Pipedrive API Token',
    authType: 'query_auth',
    inputFields: [
      {
        name: 'apiToken',
        label: 'API Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from pipedrive.com → Settings → Personal Preferences → API',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Pipedrive' },
    validation: { requiredFields: ['apiToken'] },
    injection: [{ target: 'query', name: 'api_token', valueTemplate: '{{apiToken}}' }],
    testRequest: { method: 'GET', url: 'https://api.pipedrive.com/v1/users/me', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiToken'],
  },

  // ─── Zoho CRM ────────────────────────────────────────────────────────────────
  {
    id: 'zoho_oauth2',
    provider: 'zoho',
    displayName: 'Zoho CRM OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Zoho', testLabel: 'Test Zoho' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Zoho-oauthtoken {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://accounts.zoho.in/oauth/v2/info', successStatus: [200] },
    oauth2: {
      provider: 'zoho',
      authorizationUrl: 'https://accounts.zoho.in/oauth/v2/auth',
      tokenUrl: 'https://accounts.zoho.in/oauth/v2/token',
      clientIdEnv: 'ZOHO_CLIENT_ID',
      clientSecretEnv: 'ZOHO_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_ZOHO_OAUTH_REDIRECT_URI',
      defaultScopes: ['ZohoCRM.modules.ALL', 'ZohoCRM.users.READ'],
      scopeSeparator: ',',
      pkce: false,
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── Airtable ───────────────────────────────────────────────────────────────
  {
    id: 'airtable_api_key',
    provider: 'airtable',
    displayName: 'Airtable Personal Access Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at airtable.com/create/tokens',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Airtable' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.airtable.com/v0/meta/whoami', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Freshdesk ──────────────────────────────────────────────────────────────
  {
    id: 'freshdesk_api_key',
    provider: 'freshdesk',
    displayName: 'Freshdesk API Key',
    authType: 'basic_auth',
    inputFields: [
      {
        name: 'username',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from your Freshdesk profile → View API Key',
      },
      { name: 'password', label: 'Password (use X)', type: 'text', required: false, defaultValue: 'X' },
      {
        name: 'domain',
        label: 'Domain',
        type: 'url',
        required: true,
        placeholder: 'yourcompany.freshdesk.com',
        helpText: 'Your Freshdesk subdomain',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Freshdesk' },
    validation: { requiredFields: ['username', 'domain'] },
    injection: [{ target: 'basic_auth', valueTemplate: '{{username}}:X' }],
    testRequest: { method: 'GET', url: 'https://{{domain}}/api/v2/agents/me', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['username'],
  },

  // ─── Intercom ───────────────────────────────────────────────────────────────
  {
    id: 'intercom_token',
    provider: 'intercom',
    displayName: 'Intercom Access Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Access Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from developers.intercom.com → Your App → Configure → Authentication',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Intercom' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.intercom.io/me', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Discord ─────────────────────────────────────────────────────────────────
  {
    id: 'discord_webhook',
    provider: 'discord',
    displayName: 'Discord Webhook URL',
    authType: 'custom_header',
    inputFields: [
      {
        name: 'headerName',
        label: 'Webhook URL',
        type: 'url',
        required: true,
        placeholder: 'https://discord.com/api/webhooks/...',
        helpText: 'Discord Server → Channel Settings → Integrations → Webhooks',
      },
      { name: 'headerValue', label: 'Type', type: 'text', required: false, defaultValue: 'webhook' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Webhook', testLabel: 'Test Discord' },
    validation: { requiredFields: ['headerName'] },
    injection: [{ target: 'header', name: 'X-Discord-Webhook', valueTemplate: '{{headerName}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['headerName'],
  },
  {
    id: 'discord_bot_token',
    provider: 'discord',
    displayName: 'Discord Bot Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Bot Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from discord.com/developers/applications → Bot → Token',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Discord Bot' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bot {{token}}' }],
    testRequest: { method: 'GET', url: 'https://discord.com/api/v10/users/@me', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Telegram ────────────────────────────────────────────────────────────────
  {
    id: 'telegram_bot_token',
    provider: 'telegram',
    displayName: 'Telegram Bot Token',
    authType: 'api_key',
    inputFields: [
      {
        name: 'apiKey',
        label: 'Bot Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from Telegram → @BotFather → /newbot',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Bot Token', testLabel: 'Test Telegram' },
    validation: { requiredFields: ['apiKey'] },
    injection: [{ target: 'header', name: 'X-Telegram-Bot-Token', valueTemplate: '{{apiKey}}' }],
    testRequest: { method: 'GET', url: 'https://api.telegram.org/bot{{apiKey}}/getMe', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiKey'],
  },

  // ─── WhatsApp Business ───────────────────────────────────────────────────────
  {
    id: 'whatsapp_api_key',
    provider: 'whatsapp',
    displayName: 'WhatsApp Business API',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Access Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from developers.facebook.com → WhatsApp → API Setup',
      },
      { name: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true, placeholder: '123456789012345' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test WhatsApp' },
    validation: { requiredFields: ['token', 'phoneNumberId'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Twilio ──────────────────────────────────────────────────────────────────
  {
    id: 'twilio_api_key',
    provider: 'twilio',
    displayName: 'Twilio Account Credentials',
    authType: 'basic_auth',
    inputFields: [
      {
        name: 'username',
        label: 'Account SID',
        type: 'text',
        required: true,
        placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        helpText: 'Get from console.twilio.com',
      },
      {
        name: 'password',
        label: 'Auth Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from console.twilio.com',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Twilio' },
    validation: { requiredFields: ['username', 'password'] },
    injection: [{ target: 'basic_auth', valueTemplate: '{{username}}:{{password}}' }],
    testRequest: { method: 'GET', url: 'https://api.twilio.com/2010-04-01/Accounts/{{username}}.json', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['password'],
  },

  // ─── SendGrid ─────────────────────────────────────────────────────────────────
  {
    id: 'sendgrid_api_key',
    provider: 'sendgrid',
    displayName: 'SendGrid API Key',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at app.sendgrid.com/settings/api_keys',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save API Key', testLabel: 'Test SendGrid' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.sendgrid.com/v3/user/account', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Mailchimp ────────────────────────────────────────────────────────────────
  // API key shown first (free) — OAuth requires a paid Mailchimp plan
  {
    id: 'mailchimp_api_key',
    provider: 'mailchimp',
    displayName: 'Mailchimp API Key',
    authType: 'basic_auth',
    inputFields: [
      { name: 'username', label: 'Username (any value)', type: 'text', required: true, defaultValue: 'user', helpText: 'Mailchimp basic auth requires any non-empty username — "user" works fine' },
      {
        name: 'password',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us21',
        helpText: 'Get free at mailchimp.com → Account → Extras → API Keys',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save API Key', testLabel: 'Test Mailchimp' },
    validation: { requiredFields: ['password'] },
    injection: [{ target: 'basic_auth', valueTemplate: '{{username}}:{{password}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['password'],
  },
  // OAuth2 requires paid Mailchimp plan — MAILCHIMP_CLIENT_ID/SECRET must be set
  {
    id: 'mailchimp_oauth2',
    provider: 'mailchimp',
    displayName: 'Mailchimp OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Mailchimp', testLabel: 'Test Mailchimp' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://login.mailchimp.com/oauth2/metadata', successStatus: [200] },
    oauth2: {
      provider: 'mailchimp',
      authorizationUrl: 'https://login.mailchimp.com/oauth2/authorize',
      tokenUrl: 'https://login.mailchimp.com/oauth2/token',
      clientIdEnv: 'MAILCHIMP_CLIENT_ID',
      clientSecretEnv: 'MAILCHIMP_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_MAILCHIMP_OAUTH_REDIRECT_URI',
      defaultScopes: [],
      scopeSeparator: ' ',
    },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── AWS S3 ──────────────────────────────────────────────────────────────────
  {
    id: 'aws_s3_api_key',
    provider: 'aws',
    displayName: 'AWS S3 Credentials',
    authType: 'api_key',
    inputFields: [
      {
        name: 'apiKey',
        label: 'Access Key ID',
        type: 'text',
        required: true,
        placeholder: 'AKIAIOSFODNN7EXAMPLE',
        helpText: 'From AWS IAM → Users → Security Credentials',
      },
      { name: 'secretKey', label: 'Secret Access Key', type: 'password', required: true, secret: true },
      { name: 'region', label: 'Region', type: 'text', required: true, placeholder: 'us-east-1' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test AWS' },
    validation: { requiredFields: ['apiKey', 'secretKey', 'region'] },
    injection: [{ target: 'header', name: 'X-Amz-Access-Key', valueTemplate: '{{apiKey}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['secretKey'],
  },

  // ─── Cloudflare ──────────────────────────────────────────────────────────────
  {
    id: 'cloudflare_api_key',
    provider: 'cloudflare',
    displayName: 'Cloudflare API Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'API Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at dash.cloudflare.com/profile/api-tokens',
      },
      { name: 'accountId', label: 'Account ID', type: 'text', required: false, helpText: 'From Cloudflare dashboard sidebar' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Cloudflare' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.cloudflare.com/client/v4/user/tokens/verify', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Dropbox ──────────────────────────────────────────────────────────────────
  {
    id: 'dropbox_oauth2',
    provider: 'dropbox',
    displayName: 'Dropbox OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Dropbox', testLabel: 'Test Dropbox' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: {
      method: 'POST',
      url: 'https://api.dropboxapi.com/2/users/get_current_account',
      headers: { 'Content-Type': 'application/json' },
      body: null,
      successStatus: [200],
    },
    oauth2: {
      provider: 'dropbox',
      authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
      tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
      clientIdEnv: 'DROPBOX_CLIENT_ID',
      clientSecretEnv: 'DROPBOX_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_DROPBOX_OAUTH_REDIRECT_URI',
      defaultScopes: ['account_info.read', 'files.content.read', 'files.content.write'],
      scopeSeparator: ' ',
      accessType: 'offline',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── Supabase ─────────────────────────────────────────────────────────────────
  {
    id: 'supabase_api_key',
    provider: 'db',
    displayName: 'Supabase Project Credentials',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'projectUrl',
        label: 'Project URL',
        type: 'url',
        required: true,
        placeholder: 'https://xyzabc.db.co',
        helpText: 'From db.com project → Settings → API',
      },
      {
        name: 'token',
        label: 'Service Role Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'From db.com project → Settings → API',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Supabase' },
    validation: { requiredFields: ['projectUrl', 'token'] },
    injection: [
      { target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' },
      { target: 'header', name: 'apikey', valueTemplate: '{{token}}' },
    ],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── MongoDB ──────────────────────────────────────────────────────────────────
  {
    id: 'mongodb_connection',
    provider: 'mongodb',
    displayName: 'MongoDB Connection String',
    authType: 'basic_auth',
    inputFields: [
      {
        name: 'username',
        label: 'Connection String',
        type: 'password',
        required: true,
        secret: true,
        placeholder: 'mongodb+srv://user:pass@cluster.mongodb.net',
        helpText: 'From MongoDB Atlas → Connect → Connection String',
      },
      { name: 'password', label: 'Database Name', type: 'text', required: false, placeholder: 'myDatabase' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Connection', testLabel: 'Test MongoDB' },
    validation: { requiredFields: ['username'] },
    injection: [{ target: 'header', name: 'X-MongoDB-Connection', valueTemplate: '{{username}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['username'],
  },

  // ─── OpenAI ───────────────────────────────────────────────────────────────────
  {
    id: 'openai_api_key',
    provider: 'openai',
    displayName: 'OpenAI API Key',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at platform.openai.com/api-keys',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save API Key', testLabel: 'Test OpenAI' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.openai.com/v1/models', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Anthropic ────────────────────────────────────────────────────────────────
  {
    id: 'anthropic_api_key',
    provider: 'anthropic',
    displayName: 'Anthropic API Key',
    authType: 'api_key',
    inputFields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at console.anthropic.com/settings/keys',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save API Key', testLabel: 'Test Anthropic' },
    validation: { requiredFields: ['apiKey'] },
    injection: [{ target: 'header', name: 'x-api-key', valueTemplate: '{{apiKey}}' }],
    testRequest: {
      method: 'GET',
      url: 'https://api.anthropic.com/v1/models',
      headers: { 'anthropic-version': '2023-06-01' },
      successStatus: [200],
    },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiKey'],
  },

  // ─── Pinecone ─────────────────────────────────────────────────────────────────
  {
    id: 'pinecone_api_key',
    provider: 'pinecone',
    displayName: 'Pinecone API Key',
    authType: 'api_key',
    inputFields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Get from app.pinecone.io → API Keys',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save API Key', testLabel: 'Test Pinecone' },
    validation: { requiredFields: ['apiKey'] },
    injection: [{ target: 'header', name: 'Api-Key', valueTemplate: '{{apiKey}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiKey'],
  },

  // ─── Qdrant ───────────────────────────────────────────────────────────────────
  {
    id: 'qdrant_api_key',
    provider: 'qdrant',
    displayName: 'Qdrant API Key',
    authType: 'api_key',
    inputFields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'From Qdrant Cloud dashboard',
      },
      {
        name: 'apiUrl',
        label: 'API URL',
        type: 'url',
        required: true,
        placeholder: 'https://xyz.us-east-1-0.aws.cloud.qdrant.io',
        helpText: 'Your Qdrant cluster URL',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Qdrant' },
    validation: { requiredFields: ['apiKey', 'apiUrl'] },
    injection: [{ target: 'header', name: 'api-key', valueTemplate: '{{apiKey}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiKey'],
  },

  // ─── Cohere ───────────────────────────────────────────────────────────────────
  {
    id: 'cohere_api_key',
    provider: 'cohere',
    displayName: 'Cohere API Key',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at dashboard.cohere.com/api-keys',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save API Key', testLabel: 'Test Cohere' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.cohere.com/v1/check-api-key', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Hugging Face ─────────────────────────────────────────────────────────────
  {
    id: 'huggingface_token',
    provider: 'huggingface',
    displayName: 'Hugging Face Access Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Access Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at huggingface.co/settings/tokens',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Hugging Face' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://huggingface.co/api/whoami', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Mistral AI ───────────────────────────────────────────────────────────────
  {
    id: 'mistral_api_key',
    provider: 'mistral',
    displayName: 'Mistral AI API Key',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'API Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at console.mistral.ai/api-keys',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save API Key', testLabel: 'Test Mistral' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.mistral.ai/v1/models', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Stripe ───────────────────────────────────────────────────────────────────
  {
    id: 'stripe_api_key',
    provider: 'stripe',
    displayName: 'Stripe Secret Key',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Secret Key',
        type: 'password',
        required: true,
        secret: true,
        placeholder: 'sk_live_... or sk_test_...',
        helpText: 'Get from dashboard.stripe.com/apikeys',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Key', testLabel: 'Test Stripe' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.stripe.com/v1/account', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── PayPal ───────────────────────────────────────────────────────────────────
  {
    id: 'paypal_oauth2',
    provider: 'paypal',
    displayName: 'PayPal OAuth2',
    authType: 'oauth2',
    inputFields: [
      {
        name: 'mode',
        label: 'Mode',
        type: 'select',
        required: false,
        options: [{ label: 'Sandbox', value: 'sandbox' }, { label: 'Production', value: 'production' }],
        defaultValue: 'sandbox',
      },
    ],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect PayPal', testLabel: 'Test PayPal' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    oauth2: {
      provider: 'paypal',
      authorizationUrl: 'https://www.paypal.com/signin/authorize',
      tokenUrl: 'https://api-m.paypal.com/v1/oauth2/token',
      clientIdEnv: 'PAYPAL_CLIENT_ID',
      clientSecretEnv: 'PAYPAL_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_PAYPAL_OAUTH_REDIRECT_URI',
      defaultScopes: ['openid', 'profile', 'email'],
      scopeSeparator: ' ',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── QuickBooks ───────────────────────────────────────────────────────────────
  {
    id: 'quickbooks_oauth2',
    provider: 'quickbooks',
    displayName: 'QuickBooks OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect QuickBooks', testLabel: 'Test QuickBooks' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    oauth2: {
      provider: 'quickbooks',
      authorizationUrl: 'https://appcenter.intuit.com/connect/oauth2',
      tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      clientIdEnv: 'QUICKBOOKS_CLIENT_ID',
      clientSecretEnv: 'QUICKBOOKS_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_QUICKBOOKS_OAUTH_REDIRECT_URI',
      defaultScopes: ['com.intuit.quickbooks.accounting'],
      scopeSeparator: ' ',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── Xero ─────────────────────────────────────────────────────────────────────
  {
    id: 'xero_oauth2',
    provider: 'xero',
    displayName: 'Xero OAuth2',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Xero', testLabel: 'Test Xero' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://api.xero.com/connections', successStatus: [200] },
    oauth2: {
      provider: 'xero',
      authorizationUrl: 'https://login.xero.com/identity/connect/authorize',
      tokenUrl: 'https://identity.xero.com/connect/token',
      clientIdEnv: 'XERO_CLIENT_ID',
      clientSecretEnv: 'XERO_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_XERO_OAUTH_REDIRECT_URI',
      defaultScopes: ['openid', 'profile', 'email', 'accounting.transactions', 'offline_access'],
      scopeSeparator: ' ',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: ['access_token', 'refresh_token'],
  },

  // ─── Shopify ──────────────────────────────────────────────────────────────────
  {
    id: 'shopify_api_key',
    provider: 'shopify',
    displayName: 'Shopify Admin API',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'storeUrl',
        label: 'Store URL',
        type: 'url',
        required: true,
        placeholder: 'yourstore.myshopify.com',
        helpText: 'Your Shopify store domain',
      },
      {
        name: 'token',
        label: 'Admin API Access Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'From Shopify Admin → Apps → Develop apps → Create app',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Shopify' },
    validation: { requiredFields: ['storeUrl', 'token'] },
    injection: [{ target: 'header', name: 'X-Shopify-Access-Token', valueTemplate: '{{token}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },
  {
    id: 'shopify_oauth2',
    provider: 'shopify',
    displayName: 'Shopify OAuth2 (Public App)',
    authType: 'oauth2',
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Shopify', testLabel: 'Test Shopify' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'X-Shopify-Access-Token', valueTemplate: '{{access_token}}' }],
    oauth2: {
      provider: 'shopify',
      authorizationUrl: 'https://{{shop}}/admin/oauth/authorize',
      tokenUrl: 'https://{{shop}}/admin/oauth/access_token',
      clientIdEnv: 'SHOPIFY_CLIENT_ID',
      clientSecretEnv: 'SHOPIFY_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_SHOPIFY_OAUTH_REDIRECT_URI',
      defaultScopes: ['read_products', 'write_products', 'read_orders'],
      scopeSeparator: ',',
    },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['access_token'],
  },

  // ─── WooCommerce ──────────────────────────────────────────────────────────────
  {
    id: 'woocommerce_api_key',
    provider: 'woocommerce',
    displayName: 'WooCommerce REST API',
    authType: 'basic_auth',
    inputFields: [
      {
        name: 'storeUrl',
        label: 'Store URL',
        type: 'url',
        required: true,
        placeholder: 'https://yourstore.com',
        helpText: 'Your WooCommerce store URL',
      },
      {
        name: 'username',
        label: 'Consumer Key',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'From WooCommerce → Settings → Advanced → REST API',
      },
      { name: 'password', label: 'Consumer Secret', type: 'password', required: true, secret: true },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test WooCommerce' },
    validation: { requiredFields: ['storeUrl', 'username', 'password'] },
    injection: [{ target: 'basic_auth', valueTemplate: '{{username}}:{{password}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['username', 'password'],
  },

  // ─── Typeform ─────────────────────────────────────────────────────────────────
  {
    id: 'typeform_token',
    provider: 'typeform',
    displayName: 'Typeform Personal Access Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'Create at admin.typeform.com/account#/section/tokens',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Typeform' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    testRequest: { method: 'GET', url: 'https://api.typeform.com/me', successStatus: [200] },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },

  // ─── Generic Auth Types ───────────────────────────────────────────────────────
  {
    id: 'api_key',
    provider: 'generic',
    displayName: 'API Key',
    authType: 'api_key',
    inputFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true },
      { name: 'headerName', label: 'Header Name', type: 'text', required: false, defaultValue: 'X-API-Key' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save API Key', testLabel: 'Test Key' },
    validation: { requiredFields: ['apiKey'] },
    injection: [{ target: 'header', name: '{{headerName|X-API-Key}}', valueTemplate: '{{apiKey}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiKey'],
  },
  {
    id: 'bearer_token',
    provider: 'generic',
    displayName: 'Bearer Token',
    authType: 'bearer_token',
    inputFields: [{ name: 'token', label: 'Token', type: 'password', required: true, secret: true }],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Token' },
    validation: { requiredFields: ['token'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },
  {
    id: 'basic_auth',
    provider: 'generic',
    displayName: 'Basic Auth',
    authType: 'basic_auth',
    inputFields: [
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Login', testLabel: 'Test Login' },
    validation: { requiredFields: ['username', 'password'] },
    injection: [{ target: 'basic_auth', valueTemplate: '{{username}}:{{password}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['password'],
  },
  {
    id: 'custom_header',
    provider: 'generic',
    displayName: 'Custom Header Auth',
    authType: 'custom_header',
    inputFields: [
      { name: 'headerName', label: 'Header Name', type: 'text', required: true },
      { name: 'headerValue', label: 'Header Value', type: 'password', required: true, secret: true },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Header', testLabel: 'Test Header' },
    validation: { requiredFields: ['headerName', 'headerValue'] },
    injection: [{ target: 'header', name: '{{headerName}}', valueTemplate: '{{headerValue}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['headerValue'],
  },
  {
    id: 'query_auth',
    provider: 'generic',
    displayName: 'Query Auth',
    authType: 'query_auth',
    inputFields: [
      { name: 'queryName', label: 'Query Parameter', type: 'text', required: true },
      { name: 'queryValue', label: 'Query Value', type: 'password', required: true, secret: true },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Query Auth', testLabel: 'Test Query Auth' },
    validation: { requiredFields: ['queryName', 'queryValue'] },
    injection: [{ target: 'query', name: '{{queryName}}', valueTemplate: '{{queryValue}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['queryValue'],
  },

  // ─── Social Media ─────────────────────────────────────────────────────────────
  {
    id: 'twitter_oauth2',
    provider: 'twitter',
    displayName: 'Twitter / X OAuth2',
    authType: 'oauth2',
    requiredScopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Twitter / X', testLabel: 'Test Twitter' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://api.twitter.com/2/users/me', successStatus: [200] },
    oauth2: {
      provider: 'twitter',
      authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      clientIdEnv: 'TWITTER_CLIENT_ID',
      clientSecretEnv: 'TWITTER_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_TWITTER_OAUTH_REDIRECT_URI',
      defaultScopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
      scopeSeparator: ' ',
      tokenAuthMethod: 'basic',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: [],
  },
  {
    id: 'facebook_oauth2',
    provider: 'facebook',
    displayName: 'Facebook OAuth2',
    authType: 'oauth2',
    requiredScopes: ['public_profile', 'email', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Facebook', testLabel: 'Test Facebook' },
    validation: { requiredFields: [] },
    injection: [{ target: 'query', name: 'access_token', valueTemplate: '{{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://graph.facebook.com/me', successStatus: [200] },
    oauth2: {
      provider: 'facebook',
      authorizationUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
      clientIdEnv: 'META_APP_ID',
      clientSecretEnv: 'META_APP_SECRET',
      redirectUriEnv: 'GENERIC_FACEBOOK_OAUTH_REDIRECT_URI',
      defaultScopes: facebookOAuthScopes,
      scopeSeparator: ',',
      authParams: optionalAuthParam('config_id', facebookBusinessConfigId),
    },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: [],
  },
  {
    id: 'instagram_oauth2',
    provider: 'instagram',
    displayName: 'Instagram OAuth2',
    authType: 'oauth2',
    requiredScopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management'],
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect Instagram', testLabel: 'Test Instagram' },
    validation: { requiredFields: [] },
    injection: [{ target: 'query', name: 'access_token', valueTemplate: '{{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://graph.instagram.com/me?fields=id,username', successStatus: [200] },
    oauth2: {
      provider: 'instagram',
      authorizationUrl: 'https://api.instagram.com/oauth/authorize',
      tokenUrl: 'https://api.instagram.com/oauth/access_token',
      clientIdEnv: 'META_APP_ID',
      clientSecretEnv: 'META_APP_SECRET',
      redirectUriEnv: 'GENERIC_INSTAGRAM_OAUTH_REDIRECT_URI',
      defaultScopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management'],
      scopeSeparator: ',',
    },
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: [],
  },
  {
    id: 'linkedin_oauth2',
    provider: 'linkedin',
    displayName: 'LinkedIn OAuth2',
    authType: 'oauth2',
    requiredScopes: ['w_member_social', 'r_emailaddress', 'r_liteprofile'],
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect LinkedIn', testLabel: 'Test LinkedIn' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://api.linkedin.com/v2/me', successStatus: [200] },
    oauth2: {
      provider: 'linkedin',
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      clientIdEnv: 'LINKEDIN_CLIENT_ID',
      clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_LINKEDIN_OAUTH_REDIRECT_URI',
      defaultScopes: ['w_member_social', 'r_emailaddress', 'r_liteprofile'],
      scopeSeparator: ' ',
      pkce: false,
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: [],
  },
  {
    id: 'youtube_oauth2',
    provider: 'youtube',
    displayName: 'YouTube OAuth2',
    authType: 'oauth2',
    requiredScopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'],
    inputFields: [],
    form: { layout: 'stacked', oauthButtonLabel: 'Connect YouTube', testLabel: 'Test YouTube' },
    validation: { requiredFields: [] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{access_token}}' }],
    testRequest: { method: 'GET', url: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', successStatus: [200] },
    oauth2: {
      provider: 'youtube',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
      clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
      redirectUriEnv: 'GENERIC_YOUTUBE_OAUTH_REDIRECT_URI',
      defaultScopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'],
      scopeSeparator: ' ',
      accessType: 'offline',
      prompt: 'consent',
    },
    refresh: { enabled: true, refreshBeforeSeconds: 300 },
    maskFields: [],
  },

  // ─── Databases ────────────────────────────────────────────────────────────────
  {
    id: 'postgresql_connection',
    provider: 'postgresql',
    displayName: 'PostgreSQL',
    authType: 'basic_auth',
    inputFields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', required: true, defaultValue: 5432 },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
      { name: 'ssl', label: 'SSL Mode', type: 'select', required: false, defaultValue: 'disable', options: [{ label: 'Disable', value: 'disable' }, { label: 'Require', value: 'require' }, { label: 'Verify-Full', value: 'verify-full' }] },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Connection', testLabel: 'Test Connection' },
    validation: { requiredFields: ['host', 'database', 'username', 'password'] },
    injection: [{ target: 'header', name: 'X-DB-Connection', valueTemplate: 'postgresql://{{username}}:{{password}}@{{host}}:{{port}}/{{database}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['password'],
  },
  {
    id: 'mysql_connection',
    provider: 'mysql',
    displayName: 'MySQL',
    authType: 'basic_auth',
    inputFields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', required: true, defaultValue: 3306 },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Connection', testLabel: 'Test Connection' },
    validation: { requiredFields: ['host', 'database', 'username', 'password'] },
    injection: [{ target: 'header', name: 'X-DB-Connection', valueTemplate: 'mysql://{{username}}:{{password}}@{{host}}:{{port}}/{{database}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['password'],
  },
  {
    id: 'firebase_credentials',
    provider: 'firebase',
    displayName: 'Firebase / Firestore',
    authType: 'api_key',
    inputFields: [
      { name: 'projectId', label: 'Project ID', type: 'text', required: true, placeholder: 'my-firebase-project' },
      { name: 'apiKey', label: 'Web API Key', type: 'password', required: true, secret: true, helpText: 'From Firebase Console → Project Settings → General' },
      { name: 'serviceAccountJson', label: 'Service Account JSON', type: 'textarea', required: false, secret: true, helpText: 'Paste the full service account JSON for server-side access' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Firebase' },
    validation: { requiredFields: ['projectId', 'apiKey'] },
    injection: [{ target: 'header', name: 'X-Firebase-Project', valueTemplate: '{{projectId}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiKey', 'serviceAccountJson'],
  },
  {
    id: 'redis_connection',
    provider: 'redis',
    displayName: 'Redis',
    authType: 'api_key',
    inputFields: [
      { name: 'url', label: 'Redis URL', type: 'text', required: true, placeholder: 'redis://localhost:6379', helpText: 'e.g. redis://:password@host:6379 or rediss:// for TLS' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Connection', testLabel: 'Test Connection' },
    validation: { requiredFields: ['url'] },
    injection: [{ target: 'header', name: 'X-Redis-URL', valueTemplate: '{{url}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['url'],
  },

  // ─── Marketing & Support ──────────────────────────────────────────────────────
  {
    id: 'activecampaign_api',
    provider: 'activecampaign',
    displayName: 'ActiveCampaign API',
    authType: 'api_key',
    inputFields: [
      { name: 'apiUrl', label: 'Account URL', type: 'url', required: true, placeholder: 'https://youraccountname.api-us1.com', helpText: 'From ActiveCampaign → Settings → Developer' },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test ActiveCampaign' },
    validation: { requiredFields: ['apiUrl', 'apiKey'] },
    testRequest: { method: 'GET', url: '{{apiUrl}}/api/3/users/me', headers: { 'Api-Token': '{{apiKey}}' }, successStatus: [200] },
    injection: [{ target: 'header', name: 'Api-Token', valueTemplate: '{{apiKey}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiKey'],
  },
  {
    id: 'zendesk_api',
    provider: 'zendesk',
    displayName: 'Zendesk API Token',
    authType: 'basic_auth',
    inputFields: [
      { name: 'subdomain', label: 'Subdomain', type: 'text', required: true, placeholder: 'yourcompany', helpText: 'From https://yourcompany.zendesk.com' },
      { name: 'username', label: 'Email Address', type: 'text', required: true, placeholder: 'you@company.com' },
      { name: 'apiToken', label: 'API Token', type: 'password', required: true, secret: true, helpText: 'From Zendesk Admin → Apps & Integrations → Zendesk API' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Zendesk' },
    validation: { requiredFields: ['subdomain', 'username', 'apiToken'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Basic {{base64({{username}}/token:{{apiToken}})}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiToken'],
  },
  {
    id: 'calendly_api',
    provider: 'calendly',
    displayName: 'Calendly Personal Access Token',
    authType: 'bearer_token',
    inputFields: [
      {
        name: 'token',
        label: 'Personal Access Token',
        type: 'password',
        required: true,
        secret: true,
        helpText: 'From Calendly → Integrations → API & Webhooks → Personal Access Tokens',
      },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Token', testLabel: 'Test Calendly' },
    validation: { requiredFields: ['token'] },
    testRequest: { method: 'GET', url: 'https://api.calendly.com/users/me', successStatus: [200] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Bearer {{token}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['token'],
  },
  {
    id: 'mailgun_api',
    provider: 'mailgun',
    displayName: 'Mailgun API Key',
    authType: 'basic_auth',
    inputFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true, helpText: 'From Mailgun → Settings → API Keys (starts with key-)' },
      { name: 'domain', label: 'Sending Domain', type: 'text', required: true, placeholder: 'mg.yourdomain.com' },
      { name: 'region', label: 'Region', type: 'select', required: true, defaultValue: 'us', options: [{ label: 'US', value: 'us' }, { label: 'EU', value: 'eu' }] },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Mailgun' },
    validation: { requiredFields: ['apiKey', 'domain'] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Basic {{base64(api:{{apiKey}})}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['apiKey'],
  },

  // ─── DevOps ───────────────────────────────────────────────────────────────────
  {
    id: 'bitbucket_app_password',
    provider: 'bitbucket',
    displayName: 'Bitbucket App Password',
    authType: 'basic_auth',
    inputFields: [
      { name: 'username', label: 'Username', type: 'text', required: true, placeholder: 'your-bitbucket-username' },
      { name: 'appPassword', label: 'App Password', type: 'password', required: true, secret: true, helpText: 'From Bitbucket → Personal Settings → App passwords' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test Bitbucket' },
    validation: { requiredFields: ['username', 'appPassword'] },
    testRequest: { method: 'GET', url: 'https://api.bitbucket.org/2.0/user', successStatus: [200] },
    injection: [{ target: 'header', name: 'Authorization', valueTemplate: 'Basic {{base64({{username}}:{{appPassword}})}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['appPassword'],
  },

  // ─── File Transfer ────────────────────────────────────────────────────────────
  {
    id: 'ftp_credentials',
    provider: 'ftp',
    displayName: 'FTP Credentials',
    authType: 'basic_auth',
    inputFields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'ftp.example.com' },
      { name: 'port', label: 'Port', type: 'number', required: false, defaultValue: 21 },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true, secret: true },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test FTP' },
    validation: { requiredFields: ['host', 'username', 'password'] },
    injection: [{ target: 'header', name: 'X-FTP-Host', valueTemplate: '{{host}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['password'],
  },
  {
    id: 'sftp_credentials',
    provider: 'sftp',
    displayName: 'SFTP Credentials',
    authType: 'basic_auth',
    inputFields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'sftp.example.com' },
      { name: 'port', label: 'Port', type: 'number', required: false, defaultValue: 22 },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: false, secret: true },
      { name: 'privateKey', label: 'Private Key', type: 'textarea', required: false, secret: true, helpText: 'PEM-format private key (alternative to password)' },
    ],
    form: { layout: 'stacked', submitLabel: 'Save Credentials', testLabel: 'Test SFTP' },
    validation: { requiredFields: ['host', 'username'] },
    injection: [{ target: 'header', name: 'X-SFTP-Host', valueTemplate: '{{host}}' }],
    refresh: { enabled: false, refreshBeforeSeconds: 0 },
    maskFields: ['password', 'privateKey'],
  },
]);

export function getCredentialType(id: string): CredentialTypeDefinition | undefined {
  return credentialTypeDefinitions.find((definition) => definition.id === id);
}

export function getRedirectUri(definition: CredentialTypeDefinition): string {
  const envValue = definition.oauth2?.redirectUriEnv ? process.env[definition.oauth2.redirectUriEnv] : undefined;
  return envValue || `${providerBase}/api/credential-connections/oauth/callback`;
}
