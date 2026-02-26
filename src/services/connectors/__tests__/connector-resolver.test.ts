/**
 * Tests for Connector Resolver
 */

import { connectorResolver } from '../connector-resolver';

// Jest-style test framework (adjust imports based on your test framework)
declare const describe: any;
declare const it: any;
declare const expect: any;

describe('ConnectorResolver', () => {
  describe('resolveIntent', () => {
    it('should resolve "send gmail" to google_gmail connector', () => {
      const response = connectorResolver.resolveIntent({
        action: 'send',
        resource: 'email',
        provider: 'google',
      });

      expect(response.success).toBe(true);
      expect(response.result?.connectorId).toBe('google_gmail');
      expect(response.result?.connector.provider).toBe('google');
    });

    it('should resolve "send email via smtp" to smtp_email connector', () => {
      const response = connectorResolver.resolveIntent({
        action: 'send',
        resource: 'email',
        provider: 'smtp',
      });

      expect(response.success).toBe(true);
      expect(response.result?.connectorId).toBe('smtp_email');
      expect(response.result?.connector.provider).toBe('smtp');
    });

    it('should require disambiguation for generic "send email"', () => {
      const response = connectorResolver.resolveIntent({
        action: 'send',
        resource: 'email',
        // No provider specified
      });

      // Should either succeed with one match or fail with disambiguation needed
      if (response.success) {
        // If it succeeds, it should have alternatives
        expect(response.alternatives).toBeDefined();
        expect(response.alternatives?.length).toBeGreaterThan(0);
      } else {
        // If it fails, should suggest both connectors
        expect(response.error?.suggestions).toBeDefined();
        expect(response.error?.suggestions?.length).toBeGreaterThan(1);
      }
    });

    it('should resolve Slack intent to slack_webhook connector', () => {
      const response = connectorResolver.resolveIntent({
        action: 'send',
        resource: 'message',
        provider: 'slack',
      });

      expect(response.success).toBe(true);
      expect(response.result?.connectorId).toBe('slack_webhook');
    });
  });

  describe('extractIntents', () => {
    it('should extract Gmail intent from prompt', () => {
      const intents = connectorResolver.extractIntents('send email via gmail');
      expect(intents.length).toBeGreaterThan(0);
      expect(intents.some(i => i.provider === 'google' && i.resource === 'email')).toBe(true);
    });

    it('should extract SMTP intent from prompt', () => {
      const intents = connectorResolver.extractIntents('send email notification via smtp');
      expect(intents.length).toBeGreaterThan(0);
      expect(intents.some(i => i.resource === 'email')).toBe(true);
    });

    it('should extract Slack intent from prompt', () => {
      const intents = connectorResolver.extractIntents('send slack message');
      expect(intents.length).toBeGreaterThan(0);
      expect(intents.some(i => i.provider === 'slack' && i.resource === 'message')).toBe(true);
    });
  });

  describe('resolvePrompt', () => {
    it('should resolve "send gmail" prompt', () => {
      const result = connectorResolver.resolvePrompt('send gmail');
      expect(result.resolved.length).toBeGreaterThan(0);
      expect(result.resolved.some(r => r.connectorId === 'google_gmail')).toBe(true);
    });

    it('should resolve "send email via smtp" prompt', () => {
      const result = connectorResolver.resolvePrompt('send email via smtp');
      expect(result.resolved.length).toBeGreaterThan(0);
      expect(result.resolved.some(r => r.connectorId === 'smtp_email')).toBe(true);
    });

    it('should handle ambiguous "send email" prompt', () => {
      const result = connectorResolver.resolvePrompt('send email');
      // Should either resolve with alternatives or have errors/ambiguous
      expect(result.resolved.length + result.ambiguous.length + result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('assertGmailIntegrity', () => {
    it('should pass for prompt with gmail and google_gmail connector', () => {
      expect(() => {
        connectorResolver.assertGmailIntegrity('send gmail', ['google_gmail']);
      }).not.toThrow();
    });

    it('should fail for prompt with gmail but no google_gmail connector', () => {
      expect(() => {
        connectorResolver.assertGmailIntegrity('send gmail', ['smtp_email']);
      }).toThrow();
    });

    it('should fail for prompt with gmail and smtp_email connector', () => {
      expect(() => {
        connectorResolver.assertGmailIntegrity('send gmail', ['google_gmail', 'smtp_email']);
      }).toThrow();
    });

    it('should pass for prompt without gmail', () => {
      expect(() => {
        connectorResolver.assertGmailIntegrity('send email', ['smtp_email']);
      }).not.toThrow();
    });
  });
});
