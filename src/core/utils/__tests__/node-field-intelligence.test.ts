import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import {
  buildFieldIntelligence,
  buildFieldGuidanceDescription,
  mergeGuidanceWithDeterministic,
  validateWorkflowNodeIntelligence,
} from '../node-field-intelligence';
import { evaluateGuidanceQuality } from '../guidance-quality-evaluator';
import { buildDeterministicFieldOwnershipGuidance } from '../../../services/ai/field-ownership-guidance-prompt';

describe('node field intelligence', () => {
  it('infers intelligence for every registered text_summarizer field and preserves maxLength risk', () => {
    const def = unifiedNodeRegistry.get('text_summarizer');
    expect(def).toBeDefined();
    const maxLength = def!.inputSchema.maxLength;

    expect(maxLength.fieldIntelligence).toBeDefined();
    expect(maxLength.fieldIntelligence?.importance?.base).toBe('recommended');
    expect(maxLength.fieldIntelligence?.importance?.dangerousIfEmpty).toBe(true);
    expect(maxLength.fieldIntelligence?.safeDefaults?.[0]?.value).toBe(150);
  });

  it('infers bounded output risk from field semantics without node-specific metadata', () => {
    const intelligence = buildFieldIntelligence({
      nodeType: 'any_future_node',
      fieldName: 'maxLength',
      field: {
        type: 'number',
        description: 'Maximum output length',
        required: false,
        default: 0,
      },
    });

    expect(intelligence.importance?.base).toBe('recommended');
    expect(intelligence.importance?.dangerousIfEmpty).toBe(true);
    expect(intelligence.importance?.dangerousIfWrong).toBe(true);
    expect(intelligence.safeDefaults?.[0]?.value).toBe(150);
    expect(intelligence.validationHints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ when: 'empty', suggestedValue: 150 }),
        expect.objectContaining({ when: 'zero', suggestedValue: 150 }),
      ]),
    );
  });

  it('does not describe dangerous optional fields as simply safe to leave empty', () => {
    const def = unifiedNodeRegistry.get('text_summarizer')!;
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'text_summarizer',
      nodeLabel: 'Text Summarizer',
      fieldName: 'maxLength',
      field: {
        ...def.inputSchema.maxLength,
        label: 'Maximum length',
        supportsBuildtimeAI: true,
        supportsRuntimeAI: false,
      },
      workflowGoal: 'Summarize Google Sheet data and send it to Gmail',
    });

    expect(guidance.needed.toLowerCase()).toContain('recommended');
    expect(guidance.needed.toLowerCase()).toContain('leaving it empty');
    expect(guidance.needed).toContain('150');
    expect(guidance.needed.toLowerCase()).not.toContain('ai will decide');
  });

  it('prevents AI wording from weakening deterministic relevance and risk', () => {
    const def = unifiedNodeRegistry.get('text_summarizer')!;
    const deterministic = buildFieldGuidanceDescription({
      nodeType: 'text_summarizer',
      nodeLabel: 'Text Summarizer',
      fieldName: 'maxLength',
      field: def.inputSchema.maxLength,
      workflowGoal: 'Summarize updates and send a compact message',
    });

    const merged = mergeGuidanceWithDeterministic(deterministic, {
      needed: 'This is optional. Leave it empty and AI will decide.',
      dataImpact: 'No meaningful impact.',
      example: 'e.g. 999',
    });

    expect(merged.needed).toBe(deterministic.needed);
    expect(merged.dataImpact).toBe(deterministic.dataImpact);
    expect(merged.needed.toLowerCase()).not.toContain('ai will decide');
  });

  it('scores specific deterministic guidance as passing quality', () => {
    const def = unifiedNodeRegistry.get('text_summarizer')!;
    const relevance = {
      relevance: 'recommended' as const,
      shouldAskUser: true,
      shouldShowInOwnership: true,
      reason: 'maxLength bounds text before a compact downstream message.',
      riskIfEmpty: 'high' as const,
      suggestedValue: 150,
      source: 'registry' as const,
      fieldRole: 'bound',
      emptyBehavior: 'An empty value can produce unusable output.',
      wrongValueRisk: 'A wrong limit can produce too much or too little output.',
      userAction: 'Review this bound for this workflow. A safe starting value is 150.',
      guidanceQualitySignals: {
        specificity: 'strong' as const,
        usesStructuredMetadata: true,
        usesInferenceFallback: false,
      },
    };
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'text_summarizer',
      nodeLabel: 'Text Summarizer',
      fieldName: 'maxLength',
      field: {
        ...def.inputSchema.maxLength,
        fieldRelevance: relevance,
      },
    });

    const quality = evaluateGuidanceQuality(guidance, relevance);
    expect(quality.score).toBeGreaterThanOrEqual(70);
  });

  it('validates unsafe empty values through the universal workflow pass', () => {
    const issues = validateWorkflowNodeIntelligence({
      nodes: [
        {
          id: 'summarizer_1',
          type: 'text_summarizer',
          data: {
            type: 'text_summarizer',
            label: 'Text Summarizer',
            config: { text: 'Long source text', maxLength: '' },
          },
        },
      ],
      edges: [],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'summarizer_1',
          fieldName: 'maxLength',
          severity: 'warning',
          source: 'node_intelligence',
          suggestedValue: 150,
        }),
      ]),
    );
  });

  it('feeds registry-backed guidance into field ownership help', () => {
    const guidance = buildDeterministicFieldOwnershipGuidance('Do I need this?', {
      prompt: 'Summarize sheet rows and email the result',
      selectedField: { nodeId: 'n1', fieldName: 'maxLength' },
      selectedRow: {
        nodeId: 'n1',
        nodeType: 'text_summarizer',
        nodeLabel: 'Text Summarizer',
        fieldName: 'maxLength',
        required: false,
      },
      selectedNode: {
        id: 'n1',
        type: 'text_summarizer',
        label: 'Text Summarizer',
        config: {},
      },
    });

    expect(guidance.isActuallyRequired.toLowerCase()).toContain('recommended');
    expect(guidance.isActuallyRequired).toContain('150');
    expect(guidance.whatThisFieldDoes.toLowerCase()).toContain('maximum');
  });
});
