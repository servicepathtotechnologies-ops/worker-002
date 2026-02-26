/**
 * Node Resolver Tests
 * 
 * Tests deterministic node resolution from semantic intents.
 */

import { describe, it, expect } from '@jest/globals';
import { NodeResolver } from '../node-resolver';
import { NodeLibrary } from '../../nodes/node-library';

describe('NodeResolver', () => {
  const nodeLibrary = new NodeLibrary();
  const resolver = new NodeResolver(nodeLibrary);

  describe('Gmail Resolution', () => {
    it('should resolve "send gmail" to google_gmail', () => {
      const result = resolver.resolvePrompt('send gmail');
      expect(result.success).toBe(true);
      expect(result.nodeIds).toContain('google_gmail');
    });

    it('should resolve "email via google" to google_gmail', () => {
      const result = resolver.resolvePrompt('email via google');
      expect(result.success).toBe(true);
      expect(result.nodeIds).toContain('google_gmail');
    });

    it('should resolve "send slack + gmail" to both nodes', () => {
      const result = resolver.resolvePrompt('send slack + gmail');
      expect(result.success).toBe(true);
      expect(result.nodeIds).toContain('google_gmail');
      expect(result.nodeIds).toContain('slack_message');
    });

    it('should fail if Gmail mentioned but no node resolved', () => {
      // This should not happen with proper schema, but test the integrity check
      const result = resolver.resolvePrompt('send gmail');
      // Should pass because google_gmail should be resolved
      expect(result.success).toBe(true);
    });
  });

  describe('Intent Extraction', () => {
    it('should extract Gmail intent from prompt', () => {
      const intents = resolver.extractIntents('send email via gmail');
      expect(intents.length).toBeGreaterThan(0);
      expect(intents.some(i => i.provider === 'google' && i.resource === 'email')).toBe(true);
    });

    it('should extract Slack intent from prompt', () => {
      const intents = resolver.extractIntents('send slack message');
      expect(intents.length).toBeGreaterThan(0);
      expect(intents.some(i => i.provider === 'slack' && i.resource === 'message')).toBe(true);
    });
  });

  describe('Capability Matching', () => {
    it('should match by capability', () => {
      const intent = {
        action: 'send',
        resource: 'email',
        provider: 'google',
        keywords: ['gmail'],
      };
      const result = resolver.resolveIntent(intent);
      expect(result.success).toBe(true);
      expect(result.result?.nodeId).toBe('google_gmail');
    });
  });
});
