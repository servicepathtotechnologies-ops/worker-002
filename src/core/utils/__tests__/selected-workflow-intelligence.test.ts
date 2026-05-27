import * as fs from 'fs';
import * as path from 'path';
import { analyzeSelectedWorkflowIntelligence } from '../selected-workflow-intelligence';
import { buildFieldGuidanceDescription } from '../node-field-intelligence';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { generateComprehensiveNodeQuestions } from '../../../services/ai/comprehensive-node-questions-generator';
import { evaluateNodeBehaviorCoverage } from '../node-behavior-evaluation';
import { evaluateGuidanceQuality } from '../guidance-quality-evaluator';

function node(id: string, type: string, config: Record<string, unknown> = {}) {
  return { id, type, data: { type, label: type, config } };
}

function field(intelligence: ReturnType<typeof analyzeSelectedWorkflowIntelligence>, nodeId: string, fieldName: string) {
  const relevance = intelligence.nodes.find((n) => n.nodeId === nodeId)?.fields[fieldName];
  expect(relevance).toBeDefined();
  return relevance!;
}

describe('selected workflow intelligence', () => {
  it('Prompt 1: read, summarize, and send uses selected-node relevance without node-specific engine branches', () => {
    const workflow = {
      nodes: [
        node('trigger', 'manual_trigger'),
        node('sheet', 'google_sheets', { operation: 'read' }),
        node('summary', 'text_summarizer'),
        node('gmail', 'google_gmail', { operation: 'send', recipientSource: 'manual_entry' }),
      ],
      edges: [
        { source: 'trigger', target: 'sheet' },
        { source: 'sheet', target: 'summary' },
        { source: 'summary', target: 'gmail' },
      ],
    };

    const intelligence = analyzeSelectedWorkflowIntelligence(workflow);

    expect(field(intelligence, 'sheet', 'spreadsheetId').relevance).toBe('required');
    expect(field(intelligence, 'sheet', 'values').relevance).toBe('not_applicable');
    expect(field(intelligence, 'sheet', 'data').relevance).toBe('not_applicable');
    expect(field(intelligence, 'summary', 'text').relevance).toBe('required');
    expect(field(intelligence, 'summary', 'maxLength').relevance).toBe('recommended');
    expect(field(intelligence, 'summary', 'maxLength').fieldRole).toBe('bound');
    expect(field(intelligence, 'summary', 'maxLength').downstreamDependency).toContain('google_gmail');
    expect(field(intelligence, 'summary', 'maxLength').emptyBehavior).toMatch(/empty|zero|unusable/i);
    expect(field(intelligence, 'summary', 'maxLength').userAction).toMatch(/safe starting value|recommended|Review/i);
    expect(field(intelligence, 'gmail', 'recipientEmails').relevance).toBe('required');
    expect(field(intelligence, 'gmail', 'subject').relevance).toBe('required');
    expect(field(intelligence, 'gmail', 'body').relevance).toBe('required');
    expect(field(intelligence, 'gmail', 'messageId').relevance).toBe('not_applicable');
    expect(field(intelligence, 'gmail', 'query').relevance).toBe('not_applicable');
    expect(field(intelligence, 'gmail', 'maxResults').relevance).toBe('not_applicable');

    const summarizer = unifiedNodeRegistry.get('text_summarizer')!;
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'text_summarizer',
      nodeLabel: 'Text Summarizer',
      fieldName: 'maxLength',
      field: summarizer.inputSchema.maxLength,
      fieldRelevance: field(intelligence, 'summary', 'maxLength'),
      workflowGoal: 'Read the latest rows from my Google Sheet, summarize the updates, and email the summary to my manager every morning.',
    });
    expect(guidance.needed.toLowerCase()).toContain('recommended');
    expect(guidance.needed.toLowerCase()).not.toContain('automatically safe');
    expect(guidance.dataImpact).toMatch(/how much data or text/i);
    expect(evaluateGuidanceQuality(guidance, field(intelligence, 'summary', 'maxLength')).passed).toBe(true);
  });

  it('Prompt 2: search, filter, and notify makes search fields applicable and send fields not applicable', () => {
    const workflow = {
      nodes: [
        node('trigger', 'manual_trigger'),
        node('gmail', 'google_gmail', { operation: 'search' }),
        node('filter', 'if_else'),
        node('slack', 'slack_message'),
      ],
      edges: [
        { source: 'trigger', target: 'gmail' },
        { source: 'gmail', target: 'filter' },
        { source: 'filter', target: 'slack' },
      ],
    };

    const intelligence = analyzeSelectedWorkflowIntelligence(workflow);

    expect(field(intelligence, 'gmail', 'query').relevance).toBe('required');
    expect(field(intelligence, 'gmail', 'maxResults').relevance).toBe('recommended');
    expect(field(intelligence, 'gmail', 'recipientEmails').relevance).toBe('not_applicable');
    expect(field(intelligence, 'gmail', 'subject').relevance).toBe('not_applicable');
    expect(field(intelligence, 'gmail', 'body').relevance).toBe('not_applicable');
    expect(field(intelligence, 'gmail', 'messageId').relevance).toBe('not_applicable');
    expect(field(intelligence, 'filter', 'conditions').relevance).toBe('required');
    expect(field(intelligence, 'slack', 'message').relevance).toBe('recommended');
  });

  it('Prompt 3: webhook, transform, and append makes append payload fields applicable', () => {
    const workflow = {
      nodes: [
        node('webhook', 'webhook'),
        node('transform', 'edit_fields'),
        node('sheet', 'google_sheets', { operation: 'append' }),
      ],
      edges: [
        { source: 'webhook', target: 'transform' },
        { source: 'transform', target: 'sheet' },
      ],
    };

    const intelligence = analyzeSelectedWorkflowIntelligence(workflow);

    expect(field(intelligence, 'webhook', 'path').relevance).toBe('required');
    expect(field(intelligence, 'webhook', 'httpMethod').relevance).not.toBe('not_applicable');
    expect(field(intelligence, 'transform', 'fields').relevance).not.toBe('not_applicable');
    expect(field(intelligence, 'sheet', 'operation').relevance).toBe('required');
    expect(field(intelligence, 'sheet', 'spreadsheetId').relevance).toBe('required');
    expect(['required', 'recommended']).toContain(field(intelligence, 'sheet', 'sheetName').relevance);
    expect(['required', 'recommended']).toContain(field(intelligence, 'sheet', 'values').relevance);
    expect(['required', 'recommended']).toContain(field(intelligence, 'sheet', 'data').relevance);
    expect(field(intelligence, 'sheet', 'outputFormat').relevance).toBe('not_applicable');
  });

  it('filters not-applicable fields out of full configuration questions', () => {
    const result = generateComprehensiveNodeQuestions(
      {
        nodes: [node('gmail', 'google_gmail', { operation: 'send', recipientSource: 'manual_entry' })],
        edges: [],
      } as any,
      {},
      { mode: 'full_configuration' },
    );
    const fields = new Set(result.questions.map((q) => q.fieldName));

    expect(fields.has('recipientEmails')).toBe(true);
    expect(fields.has('subject')).toBe(true);
    expect(fields.has('body')).toBe(true);
    expect(fields.has('messageId')).toBe(false);
    expect(fields.has('query')).toBe(false);
    expect(fields.has('maxResults')).toBe(false);
    expect(fields.has('spreadsheetId')).toBe(false);
    expect(fields.has('sheetName')).toBe(false);
    expect(fields.has('range')).toBe(false);
  });

  it('keeps the universal engine free of node-specific type branches', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'selected-workflow-intelligence.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/google_gmail|google_sheets|text_summarizer|slack_message/);
  });

  it('produces behavior coverage for registered nodes without Gemini', () => {
    const report = evaluateNodeBehaviorCoverage(['google_gmail', 'google_sheets', 'text_summarizer']);
    expect(report.totalNodes).toBe(3);
    expect(report.evaluatedFields).toBeGreaterThan(0);
    expect(report.fieldsWithFullIntelligence).toBeGreaterThan(0);
    expect(report.fieldsUsingInferenceFallback).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(report.guidanceQualityFailures)).toBe(true);
    expect(report.fields.some((f) => f.cases.some((c) => c.name === 'empty_string'))).toBe(true);
  });
});
