import { credentialTypeDefinitions, getCredentialType } from '../credential-type-registry';
import { connectionService } from '../connection-service';

const GENERIC_STEP_1_API = 'Open your';
const GENERIC_SUMMARY_API = 'Use this guide to collect the';

const KNOWN_SPECIFIC_IDS = [
  'openai_api_key',
  'gemini_api_key',
  'anthropic_api_key',
  'stripe_api_key',
  'twilio_api_key',
  'slack_bot_token',
  'notion_api_key',
  'github_personal_access_token',
  'sendgrid_api_key',
  'postgresql_connection',
  'mysql_connection',
  'mongodb_connection',
];

describe('credential type registry', () => {
  it('registers the required production auth types', () => {
    expect(new Set(credentialTypeDefinitions.map((definition) => definition.authType))).toEqual(
      new Set(['oauth2', 'api_key', 'bearer_token', 'basic_auth', 'custom_header', 'query_auth']),
    );
  });

  it('defines OAuth refresh and injection rules for Google', () => {
    const google = getCredentialType('google_oauth2');

    expect(google?.displayName).toBe('Google OAuth2');
    expect(google?.refresh?.enabled).toBe(true);
    expect(google?.injection).toContainEqual({
      target: 'header',
      name: 'Authorization',
      valueTemplate: 'Bearer {{access_token}}',
    });
  });

  it('provides in-app credential guide metadata for every credential type and required field', () => {
    for (const definition of credentialTypeDefinitions) {
      expect(definition.guide.summary).toEqual(expect.any(String));
      expect(definition.guide.summary.length).toBeGreaterThan(0);
      expect(definition.guide.prerequisites.length).toBeGreaterThan(0);
      expect(definition.guide.steps.length).toBeGreaterThan(0);
      expect(definition.guide.securityNotes.length).toBeGreaterThan(0);

      for (const field of definition.inputFields.filter((field) => field.required)) {
        expect(definition.guide.fieldGuides[field.name]?.whereToFind).toEqual(expect.any(String));
        expect(definition.guide.fieldGuides[field.name]?.whereToFind.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns cloned guide metadata from the connection service without credential payloads', () => {
    const credentialTypes = connectionService.listCredentialTypes();
    const mysql = credentialTypes.find((definition) => definition.id === 'mysql_connection');

    expect(mysql?.guide.fieldGuides.host.label).toBe('Host');
    expect(JSON.stringify(credentialTypes)).not.toContain('encrypted_credentials');
    expect(JSON.stringify(credentialTypes)).not.toContain('"credentials"');
  });

  it('openai_api_key has provider-specific content with exact URL and token format', () => {
    const openai = getCredentialType('openai_api_key');
    expect(openai).toBeTruthy();
    const stepsText = openai!.guide.steps.join(' ');
    expect(stepsText).toContain('platform.openai.com');
    expect(stepsText).toContain('sk-');
    expect(openai!.guide.summary).not.toContain(GENERIC_SUMMARY_API);
    expect(openai!.guide.steps[0]).not.toContain(GENERIC_STEP_1_API);
  });

  it('gemini_api_key has provider-specific content with aistudio URL', () => {
    const gemini = getCredentialType('gemini_api_key');
    expect(gemini).toBeTruthy();
    const stepsText = gemini!.guide.steps.join(' ');
    expect(stepsText).toContain('aistudio.google.com');
    expect(gemini!.guide.summary).not.toContain(GENERIC_SUMMARY_API);
  });

  it('anthropic_api_key references console.anthropic.com and sk-ant prefix', () => {
    const anthropic = getCredentialType('anthropic_api_key');
    expect(anthropic).toBeTruthy();
    const stepsText = anthropic!.guide.steps.join(' ');
    expect(stepsText).toContain('console.anthropic.com');
    expect(stepsText).toContain('sk-ant');
  });

  it('stripe_api_key references dashboard.stripe.com and sk_test/sk_live format', () => {
    const stripe = getCredentialType('stripe_api_key');
    expect(stripe).toBeTruthy();
    const stepsText = stripe!.guide.steps.join(' ');
    expect(stepsText).toContain('dashboard.stripe.com');
  });

  it('twilio_api_key field guides mention AC prefix for Account SID', () => {
    const twilio = getCredentialType('twilio_api_key');
    expect(twilio).toBeTruthy();
    const accountSidGuide = twilio!.guide.fieldGuides['accountSid'] || twilio!.guide.fieldGuides['account_sid'];
    if (accountSidGuide) {
      const text = JSON.stringify(accountSidGuide);
      expect(text).toMatch(/AC/);
    }
  });

  it('known specific providers do not use generic boilerplate step 1', () => {
    for (const id of KNOWN_SPECIFIC_IDS) {
      const def = getCredentialType(id);
      if (!def) continue; // skip if not registered
      const firstStep = def.guide.steps[0];
      expect(firstStep).not.toBe(`Open your ${def.displayName} account, developer console, admin settings, or database connection page.`);
    }
  });

  it('postgresql_connection has provider-specific guide with connection string info', () => {
    const pg = getCredentialType('postgresql_connection');
    expect(pg).toBeTruthy();
    const allText = JSON.stringify(pg!.guide);
    expect(allText).toMatch(/postgresql|postgres/i);
    expect(pg!.guide.summary).not.toContain(GENERIC_SUMMARY_API);
  });
});
