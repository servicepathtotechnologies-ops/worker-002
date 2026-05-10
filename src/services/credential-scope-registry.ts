export const PROVIDER_REQUIRED_SCOPES: Record<string, string[]> = {
  google: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  gmail: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
  sheets: ['https://www.googleapis.com/auth/spreadsheets'],
  microsoft: [
    'https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Calendars.ReadWrite',
    'https://graph.microsoft.com/Team.ReadBasic.All',
    'https://graph.microsoft.com/Channel.ReadBasic.All',
    'offline_access',
  ],
  twitter: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  whatsapp: ['business_management', 'whatsapp_business_management', 'whatsapp_business_messaging'],
  linkedin: ['w_member_social', 'r_emailaddress', 'r_liteprofile'],
  notion: ['read_content', 'update_content', 'insert_content'],
  instagram: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'business_management'],
  facebook: ['public_profile', 'email', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
  github: ['repo'],
  salesforce: ['api', 'refresh_token'],
  zoho: ['ZohoCRM.modules.ALL', 'ZohoCRM.users.READ'],
  youtube: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'],
};

const NODE_PROVIDER: Record<string, string> = {
  google_gmail: 'google',
  gmail: 'google',
  google_sheets: 'google',
  google_doc: 'google',
  google_docs: 'google',
  google_calendar: 'google',
  google_drive: 'google',
  notion: 'notion',
  twitter: 'twitter',
  instagram: 'instagram',
  facebook: 'facebook',
  linkedin: 'linkedin',
  whatsapp: 'whatsapp',
  whatsapp_cloud: 'whatsapp',
  github: 'github',
  salesforce: 'salesforce',
  zoho: 'zoho',
  zoho_crm: 'zoho',
  outlook: 'microsoft',
  microsoft: 'microsoft',
  youtube: 'youtube',
};

export function normalizeProvider(provider: string): string {
  const key = provider.trim().toLowerCase();
  return NODE_PROVIDER[key] || key;
}

export function scopeSet(scopes: string[]): string {
  const normalized = Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean)));
  normalized.sort((a, b) => a.localeCompare(b));
  return normalized.length > 0 ? normalized.join('+') : 'default';
}

export function splitScopeSet(value: string | null | undefined): string[] {
  if (!value || value === 'default') return [];
  return value.split('+').map((scope) => scope.trim()).filter(Boolean);
}

export function scopesCover(available: string[], required: string[]): boolean {
  const have = new Set(available);
  return required.every((scope) => have.has(scope));
}

export function requiredScopesForProvider(provider: string, explicitScopes: string[] = []): string[] {
  if (explicitScopes.length > 0) return Array.from(new Set(explicitScopes));
  return PROVIDER_REQUIRED_SCOPES[normalizeProvider(provider)] || [];
}

export function credentialRequirementForNode(nodeType: string): { provider: string; requiredScopes: string[] } | null {
  const provider = NODE_PROVIDER[nodeType.trim().toLowerCase()];
  if (!provider) return null;
  return { provider, requiredScopes: requiredScopesForProvider(provider) };
}

