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
      workflowGoal: 'Summarize source data and deliver a compact message',
    });

    expect(guidance.needed.toLowerCase()).toContain('recommended');
    expect(guidance.needed.toLowerCase()).toMatch(/empty|safe starting value/);
    expect(guidance.needed).toContain('150');
    expect(guidance.needed.toLowerCase()).not.toContain('ai will decide');
    expect(guidance.emptyBehavior.toLowerCase()).not.toContain('configured default behavior');
    expect(guidance.offBehavior.toLowerCase()).not.toContain('configured default behavior');
    expect(guidance.setupSummary).toContain('Recommended owner:');
    expect(guidance.setupSummary.toLowerCase()).not.toContain('configured default behavior');
    expect(guidance.setupSummary).not.toMatch(/If this is off[\s\S]*If this is empty/i);
    expect(guidance.defaultBehaviorLabel).toBeTruthy();
    expect(guidance.recommendedOwner).toMatch(/You|AI Build|AI Runtime/);
  });

  it('emits expanded concrete guidance for optional fields without vague default behavior', () => {
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'generic_source',
      nodeLabel: 'Data Source',
      fieldName: 'resultFormat',
      field: {
        type: 'string',
        description: 'Output format for rows read from a data source.',
        required: false,
        default: 'json',
        role: 'type_selector',
        fillMode: { default: 'manual_static', supportsRuntimeAI: false, supportsBuildtimeAI: true },
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      },
      workflowGoal: 'Read source rows and summarize them',
      operation: 'read',
    });

    const combined = Object.values(guidance).flat().join(' ').toLowerCase();
    expect(combined).not.toContain('configured default behavior');
    expect(guidance.emptyBehavior).toContain('json');
    expect(guidance.offBehavior.toLowerCase()).toContain('result format');
    expect(guidance.defaultBehaviorLabel.toLowerCase()).toContain('default');
    expect(guidance.aiRun).toBe('Not available for this field.');
  });

  it('uses universal semantic-role empty behavior for resource and range fields', () => {
    const resource = buildFieldGuidanceDescription({
      nodeType: 'generic_source',
      nodeLabel: 'Data Source',
      fieldName: 'sourceResource',
      field: {
        type: 'string',
        description: 'Source resource identifier',
        required: false,
        role: 'id',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      },
      operation: 'read',
    });
    const range = buildFieldGuidanceDescription({
      nodeType: 'generic_source',
      nodeLabel: 'Data Source',
      fieldName: 'recordRange',
      field: {
        type: 'string',
        description: 'Subset of records to read',
        required: false,
        role: 'config',
        fieldRelevance: {
          relevance: 'optional',
          shouldAskUser: false,
          shouldShowInOwnership: true,
          reason: 'Range limits which records are used.',
          riskIfEmpty: 'none',
          source: 'registry',
          fieldRole: 'range',
        },
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      },
      operation: 'read',
    });

    expect(resource.emptyBehavior).toMatch(/resource/i);
    expect(range.emptyBehavior).toMatch(/records|rows|columns|items|range/i);
    expect(`${resource.emptyBehavior} ${range.emptyBehavior}`.toLowerCase()).not.toContain('change behavior');
  });

  it('uses universal semantic-role empty behavior for recipient and content fields', () => {
    const recipient = buildFieldGuidanceDescription({
      nodeType: 'generic_sender',
      nodeLabel: 'Message Sender',
      fieldName: 'recipient',
      field: {
        type: 'string',
        description: 'Email recipients',
        required: false,
        role: 'recipient',
        supportsRuntimeAI: true,
        supportsBuildtimeAI: true,
      },
      operation: 'deliver',
    });
    const body = buildFieldGuidanceDescription({
      nodeType: 'generic_sender',
      nodeLabel: 'Message Sender',
      fieldName: 'messageContent',
      field: {
        type: 'string',
        description: 'Email body',
        required: false,
        role: 'content',
        supportsRuntimeAI: true,
        supportsBuildtimeAI: true,
      },
      operation: 'deliver',
    });

    expect(recipient.emptyBehavior).toMatch(/recipients/i);
    expect(recipient.emptyBehavior).toMatch(/AI Runtime|earlier workflow data/i);
    expect(body.emptyBehavior).toMatch(/content|earlier workflow data|AI Runtime/i);
    expect(`${recipient.emptyBehavior} ${body.emptyBehavior}`.toLowerCase()).not.toContain('produce incomplete output');
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
    expect(merged.emptyBehavior).toBe(deterministic.emptyBehavior);
    expect(merged.offBehavior).toBe(deterministic.offBehavior);
    expect(merged.needed.toLowerCase()).not.toContain('ai will decide');
  });

  it('uses useful AI setup summary wording without weakening deterministic safety fields', () => {
    const deterministic = buildFieldGuidanceDescription({
      nodeType: 'manual_trigger',
      nodeLabel: 'Manual Trigger',
      fieldName: 'inputData',
      field: {
        type: 'object',
        description: 'Optional input data when triggered manually',
        required: false,
        example: 'e.g. {"topic":"IPL Finals"}',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
    });

    const merged = mergeGuidanceWithDeterministic(deterministic, {
      setupSummary: 'This gives Manual Trigger a small JSON test payload for the workflow. Set it only when you want a fixed setup topic. Recommended owner: AI Build. A safe example is available below.',
      needed: 'Leave it empty forever.',
    });

    expect(merged.setupSummary).toMatch(/small JSON test payload/i);
    expect(merged.needed).toBe(deterministic.needed);
  });

  it('falls back to deterministic setup summary when AI summary is vague or repetitive', () => {
    const deterministic = buildFieldGuidanceDescription({
      nodeType: 'generic_source',
      nodeLabel: 'Data Source',
      fieldName: 'resultFormat',
      field: {
        type: 'string',
        description: 'Output format',
        required: false,
        default: 'json',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
    });

    const merged = mergeGuidanceWithDeterministic(deterministic, {
      setupSummary: 'Uses configured default behavior.',
    });

    expect(merged.setupSummary).toBe(deterministic.setupSummary);
    expect(merged.setupSummary.toLowerCase()).not.toContain('configured default behavior');
  });

  it('returns actionable examples for safe setup-time values', () => {
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'manual_trigger',
      nodeLabel: 'Manual Trigger',
      fieldName: 'inputData',
      field: {
        type: 'object',
        description: 'Optional input data when triggered manually',
        required: false,
        exampleValue: { cricketTopic: 'IPL final highlights' } as any,
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
      workflowGoal: 'Create a LinkedIn post about cricket',
    });

    expect(guidance.actionableExample).toEqual(
      expect.objectContaining({
        canApply: true,
        applyMode: 'buildtime_ai_once',
        source: 'deterministic_field_guidance',
      }),
    );
    expect(guidance.actionableExample?.value).toEqual({ cricketTopic: 'IPL final highlights' });
  });

  it('turns display-only JSON examples into typed actionable examples universally', () => {
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'manual_trigger',
      nodeLabel: 'Manual Trigger',
      fieldName: 'inputData',
      field: {
        type: 'object',
        description: 'Optional input data when triggered manually',
        required: false,
        example: 'e.g. {"cricketTopic":"IPL Finals"}',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
      workflowGoal: 'Create a LinkedIn cricket post',
    });

    expect(guidance.actionableExample).toEqual(
      expect.objectContaining({
        value: { cricketTopic: 'IPL Finals' },
        canApply: true,
        source: 'deterministic_field_guidance',
      }),
    );
  });

  it('turns select examples into actionable values only when they match available options', () => {
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'linkedin',
      nodeLabel: 'LinkedIn',
      fieldName: 'operation',
      field: {
        type: 'string',
        description: 'LinkedIn operation',
        required: false,
        example: 'Example: create_post',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
        ui: {
          options: [
            { label: 'Create post', value: 'create_post' },
            { label: 'Get profile', value: 'get_profile' },
          ],
        },
      } as any,
    });

    expect(guidance.actionableExample).toEqual(
      expect.objectContaining({
        value: 'create_post',
        canApply: true,
      }),
    );
  });

  it('turns numeric display examples into typed actionable values universally', () => {
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'ai_chat_model',
      nodeLabel: 'AI Chat Model',
      fieldName: 'temperature',
      field: {
        type: 'number',
        description: 'Sampling temperature',
        required: false,
        example: 'e.g. 0.2',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
    });

    expect(guidance.actionableExample).toEqual(
      expect.objectContaining({
        value: 0.2,
        canApply: true,
      }),
    );
  });

  it('does not make credential examples one-click applyable', () => {
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'example_api',
      nodeLabel: 'Example API',
      fieldName: 'apiKey',
      field: {
        type: 'string',
        description: 'API key',
        required: true,
        ownership: 'credential',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
    });

    expect(guidance.actionableExample).toEqual(
      expect.objectContaining({
        canApply: false,
        applyMode: 'buildtime_ai_once',
      }),
    );
    expect(String(guidance.actionableExample?.reason || '').toLowerCase()).toContain('credential');
    expect(guidance.setupSummary.toLowerCase()).toMatch(/credential|connect|manual/);
  });

  it('blocks credential-looking example fields even when they contain fake examples', () => {
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'example_api',
      nodeLabel: 'Example API',
      fieldName: 'accessToken',
      field: {
        type: 'string',
        description: 'Bearer access token',
        required: true,
        example: 'e.g. sk_test_fake_value',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
    });

    expect(guidance.actionableExample).toEqual(
      expect.objectContaining({
        canApply: false,
        applyMode: 'buildtime_ai_once',
      }),
    );
    expect(String(guidance.actionableExample?.reason || '').toLowerCase()).toContain('credential');
  });

  it('allows safe AI actionable examples to replace deterministic no-example fallback', () => {
    const deterministic = buildFieldGuidanceDescription({
      nodeType: 'manual_trigger',
      nodeLabel: 'Manual Trigger',
      fieldName: 'inputData',
      field: {
        type: 'object',
        description: 'Optional input data when triggered manually',
        required: false,
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
    });

    const merged = mergeGuidanceWithDeterministic(deterministic, {
      actionableExample: {
        value: { cricketTopic: 'IPL Finals' },
        displayValue: '{"cricketTopic":"IPL Finals"}',
        canApply: true,
        applyMode: 'buildtime_ai_once',
        reason: 'AI generated a workflow-specific setup example.',
        source: 'ai_field_guidance',
      },
    });

    expect(merged.actionableExample).toEqual(
      expect.objectContaining({
        value: { cricketTopic: 'IPL Finals' },
        canApply: true,
        source: 'ai_field_guidance',
      }),
    );
  });

  it('does not let stale cached no-example guidance suppress a deterministic typed example', () => {
    const deterministic = buildFieldGuidanceDescription({
      nodeType: 'manual_trigger',
      nodeLabel: 'Manual Trigger',
      fieldName: 'inputData',
      field: {
        type: 'object',
        description: 'Optional input data when triggered manually',
        required: false,
        example: 'e.g. {"topic":"How AI saves 10 hours a week"}',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
    });

    const merged = mergeGuidanceWithDeterministic(deterministic, {
      actionableExample: {
        value: '',
        displayValue: '',
        canApply: false,
        applyMode: 'buildtime_ai_once',
        reason: 'No safe typed example is available for one-click application.',
        source: 'ai_field_guidance',
      },
    });

    expect(merged.actionableExample).toEqual(
      expect.objectContaining({
        value: { topic: 'How AI saves 10 hours a week' },
        canApply: true,
        source: 'deterministic_field_guidance',
      }),
    );
  });

  it('does not allow AI actionable examples to override credential security blocks', () => {
    const deterministic = buildFieldGuidanceDescription({
      nodeType: 'example_api',
      nodeLabel: 'Example API',
      fieldName: 'apiKey',
      field: {
        type: 'string',
        description: 'API key',
        required: true,
        ownership: 'credential',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
      } as any,
    });

    const merged = mergeGuidanceWithDeterministic(deterministic, {
      actionableExample: {
        value: 'fake-secret',
        displayValue: 'fake-secret',
        canApply: true,
        applyMode: 'buildtime_ai_once',
        reason: 'AI supplied a value.',
        source: 'ai_field_guidance',
      },
    });

    expect(merged.actionableExample).toEqual(
      expect.objectContaining({
        canApply: false,
        source: 'ai_field_guidance',
      }),
    );
  });

  it('keeps model examples inside the current node option set', () => {
    const guidance = buildFieldGuidanceDescription({
      nodeType: 'ai_chat_model',
      nodeLabel: 'AI Chat Model',
      fieldName: 'model',
      field: {
        type: 'string',
        description: 'Model used by this node',
        required: false,
        default: 'removed-model',
        supportsRuntimeAI: false,
        supportsBuildtimeAI: true,
        ui: {
          options: [
            { label: 'Qwen 2.5 14B (General Purpose)', value: 'qwen2.5:14b-instruct-q4_K_M' },
            { label: 'CtrlChecks Workflow Builder (Fine-Tuned)', value: 'ctrlchecks-workflow-builder' },
          ],
        },
      } as any,
    });

    expect(guidance.actionableExample).toEqual(
      expect.objectContaining({
        value: 'qwen2.5:14b-instruct-q4_K_M',
        canApply: true,
      }),
    );
    expect(guidance.you).toMatch(/available model options/i);
    expect(guidance.aiBuild).toMatch(/current model options/i);
    expect(guidance.aiBuild).toMatch(/removed/i);
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
