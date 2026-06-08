/**
 * Day 74: unit tests for explicit-intent-extractor
 */

// Mock the heavy summarize-layer module — we only use AliasKeyword as a type
jest.mock('../../../services/ai/summarize-layer', () => ({}));

import {
  extractExplicitNodeTypesFromVariation,
  getBlockedNodeTypes,
  isCommunicationService,
} from '../explicit-intent-extractor';

// Inline type — mirrors AliasKeyword shape without importing the heavy module
type MockAliasKeyword = { keyword: string; nodeType: string; source: 'keywords' };

const noKeywords: MockAliasKeyword[] = [];

describe('extractExplicitNodeTypesFromVariation', () => {
  it('matches a service-specific keyword (slack → slack_message)', () => {
    const result = extractExplicitNodeTypesFromVariation(
      'Send a notification via slack to the team',
      noKeywords as any,
    );
    expect(result.has('slack_message')).toBe(true);
  });

  it('matches a multi-word service keyword (google sheets → google_sheets)', () => {
    const result = extractExplicitNodeTypesFromVariation(
      'Read rows from google sheets and process them',
      noKeywords as any,
    );
    expect(result.has('google_sheets')).toBe(true);
  });

  it('returns empty set when nothing matches', () => {
    const result = extractExplicitNodeTypesFromVariation(
      'do something vague with no named service',
      noKeywords as any,
    );
    expect(result.size).toBe(0);
  });

  it('matches service keywords case-insensitively (GMAIL → google_gmail)', () => {
    const result = extractExplicitNodeTypesFromVariation(
      'forward the report to GMAIL every morning',
      noKeywords as any,
    );
    expect(result.has('google_gmail')).toBe(true);
  });

  it('does not match a word that only contains the keyword as a substring', () => {
    // "dislack" should not trigger slack_message
    const result = extractExplicitNodeTypesFromVariation(
      'run dislack pipeline',
      noKeywords as any,
    );
    expect(result.has('slack_message')).toBe(false);
  });

  it('falls back to general allKeywordData when no service keyword matches', () => {
    const keywords: MockAliasKeyword[] = [
      { keyword: 'zapier', nodeType: 'zapier_webhook', source: 'keywords' },
    ];
    const result = extractExplicitNodeTypesFromVariation(
      'trigger a zapier workflow',
      keywords as any,
    );
    expect(result.has('zapier_webhook')).toBe(true);
  });

  it('skips general allKeywordData entry when the node was already matched by service keywords', () => {
    // slack_message is matched by service keywords; general fallback should not duplicate
    const keywords: MockAliasKeyword[] = [
      { keyword: 'slack', nodeType: 'slack_message', source: 'keywords' },
    ];
    const result = extractExplicitNodeTypesFromVariation(
      'post to slack channel',
      keywords as any,
    );
    // Result should contain slack_message exactly once (Set guarantees uniqueness anyway,
    // but the intent here is that the general pass was skipped)
    expect(result.has('slack_message')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('matches multiple services in one text', () => {
    const result = extractExplicitNodeTypesFromVariation(
      'post to slack and also send a discord message',
      noKeywords as any,
    );
    expect(result.has('slack_message')).toBe(true);
    expect(result.has('discord')).toBe(true);
  });
});

describe('getBlockedNodeTypes', () => {
  it('returns all conflicting communication services when slack_message is explicit', () => {
    const blocked = getBlockedNodeTypes(new Set(['slack_message']));
    expect(blocked.has('discord')).toBe(true);
    expect(blocked.has('telegram')).toBe(true);
    expect(blocked.has('google_gmail')).toBe(true);
    expect(blocked.has('microsoft_teams')).toBe(true);
    expect(blocked.has('whatsapp')).toBe(true);
    // slack_message itself should not be in the blocked set
    expect(blocked.has('slack_message')).toBe(false);
  });

  it('returns empty set for a non-communication node', () => {
    const blocked = getBlockedNodeTypes(new Set(['google_sheets']));
    expect(blocked.size).toBe(0);
  });

  it('returns empty set when input is empty', () => {
    const blocked = getBlockedNodeTypes(new Set());
    expect(blocked.size).toBe(0);
  });

  it('unions conflicts from two explicit communication services', () => {
    const blocked = getBlockedNodeTypes(new Set(['slack_message', 'discord']));
    // slack_message blocks discord (and others); discord blocks slack_message (and others)
    // Union should include all remaining comms services
    expect(blocked.has('telegram')).toBe(true);
    expect(blocked.has('google_gmail')).toBe(true);
    expect(blocked.has('microsoft_teams')).toBe(true);
    expect(blocked.has('whatsapp')).toBe(true);
  });
});

describe('isCommunicationService', () => {
  it('returns true for a known communication service', () => {
    expect(isCommunicationService('slack_message')).toBe(true);
    expect(isCommunicationService('discord')).toBe(true);
    expect(isCommunicationService('whatsapp')).toBe(true);
  });

  it('returns false for a non-communication node type', () => {
    expect(isCommunicationService('google_sheets')).toBe(false);
    expect(isCommunicationService('postgresql')).toBe(false);
  });

  it('returns false for an unknown node type', () => {
    expect(isCommunicationService('totally_unknown_node')).toBe(false);
  });
});
