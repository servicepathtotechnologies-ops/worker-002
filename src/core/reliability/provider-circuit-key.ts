export function getProviderCircuitKeyFromNodeType(nodeType: string): string {
  const type = (nodeType || '').toLowerCase();
  if (!type) return 'provider:unknown';

  if (type.includes('gmail') || type.includes('google_')) return 'provider:google';
  if (type.includes('notion')) return 'provider:notion';
  if (type.includes('twitter')) return 'provider:twitter';
  if (type.includes('instagram')) return 'provider:instagram';
  if (type.includes('whatsapp')) return 'provider:whatsapp';
  if (type.includes('slack')) return 'provider:slack';
  if (type.includes('hubspot')) return 'provider:hubspot';
  if (type.includes('zoho')) return 'provider:zoho';
  if (type.includes('pipedrive')) return 'provider:pipedrive';
  if (type.includes('salesforce')) return 'provider:salesforce';
  if (type.includes('github')) return 'provider:github';
  if (type.includes('linkedin')) return 'provider:linkedin';
  if (type.includes('airtable')) return 'provider:airtable';
  if (type.includes('clickup')) return 'provider:clickup';
  if (type.includes('calendar')) return 'provider:calendar';
  if (type.includes('http_request') || type.includes('webhook')) return 'provider:http';
  if (type.includes('ai_') || type.includes('ollama') || type.includes('gemini')) return 'provider:ai';

  const providerPrefix = type.split('_')[0] || 'unknown';
  return `provider:${providerPrefix}`;
}
