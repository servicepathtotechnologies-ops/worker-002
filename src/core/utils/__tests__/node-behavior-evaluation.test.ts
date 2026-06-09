import { evaluateNodeBehaviorCoverage } from '../node-behavior-evaluation';

jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    getAllTypes: jest.fn(),
    get: jest.fn(),
  },
}));
jest.mock('../node-field-intelligence', () => ({
  buildFieldGuidanceDescription: jest.fn(),
  validateWorkflowNodeIntelligence: jest.fn(),
}));
jest.mock('../guidance-quality-evaluator', () => ({
  evaluateGuidanceQuality: jest.fn(),
}));
jest.mock('../selected-workflow-intelligence', () => ({
  analyzeSelectedWorkflowIntelligence: jest.fn(),
}));

import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import { buildFieldGuidanceDescription, validateWorkflowNodeIntelligence } from '../node-field-intelligence';
import { evaluateGuidanceQuality } from '../guidance-quality-evaluator';
import { analyzeSelectedWorkflowIntelligence } from '../selected-workflow-intelligence';

const getAllTypes = unifiedNodeRegistry.getAllTypes as jest.Mock;
const registryGet = unifiedNodeRegistry.get as jest.Mock;
const validate = validateWorkflowNodeIntelligence as jest.Mock;
const buildGuidance = buildFieldGuidanceDescription as jest.Mock;
const evalQuality = evaluateGuidanceQuality as jest.Mock;
const analyze = analyzeSelectedWorkflowIntelligence as jest.Mock;

function makeNodeDef(inputSchemaOverride?: Record<string, unknown>) {
  return {
    label: 'Test Node',
    inputSchema: inputSchemaOverride ?? {
      myField: {
        type: 'string',
        fieldIntelligence: {
          runtimeBehavior: { whenMissing: 'skips' },
          importance: { dangerousIfEmpty: false },
          validationHints: ['must-be-non-empty'],
        },
      },
    },
    defaultConfig: () => ({}),
  };
}

function makeRelevance(overrides: Record<string, unknown> = {}) {
  return {
    relevance: 'optional',
    shouldAskUser: false,
    shouldShowInOwnership: false,
    reason: 'test',
    source: 'inferred',
    riskIfEmpty: 'low',
    guidanceQualitySignals: {
      specificity: 'strong',
      usesStructuredMetadata: true,
      usesInferenceFallback: false,
      missingFacts: [],
    },
    ...overrides,
  };
}

function setupHappyPath(fieldName = 'myField', relevanceOverrides: Record<string, unknown> = {}) {
  analyze.mockReturnValue({
    nodes: [{ fields: { [fieldName]: makeRelevance(relevanceOverrides) }, operation: 'test_op' }],
    fields: [],
  });
  validate.mockReturnValue([]);
  buildGuidance.mockReturnValue({ description: 'test guidance' });
  evalQuality.mockReturnValue({ passed: true, score: 1.0, issues: [] });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('evaluateNodeBehaviorCoverage', () => {
  it('returns empty report when getAllTypes returns empty list', () => {
    getAllTypes.mockReturnValue([]);
    const report = evaluateNodeBehaviorCoverage();
    expect(report).toEqual({
      totalNodes: 0,
      totalFields: 0,
      evaluatedFields: 0,
      fieldsWithFullIntelligence: 0,
      fieldsUsingInferenceFallback: 0,
      unsafeGaps: [],
      riskyFieldsWithoutValidationHints: [],
      guidanceQualityFailures: [],
      fields: [],
    });
  });

  it('calls getAllTypes when invoked with no arguments', () => {
    getAllTypes.mockReturnValue([]);
    evaluateNodeBehaviorCoverage();
    expect(getAllTypes).toHaveBeenCalledTimes(1);
  });

  it('calls getAllTypes when passed an empty array', () => {
    getAllTypes.mockReturnValue([]);
    evaluateNodeBehaviorCoverage([]);
    expect(getAllTypes).toHaveBeenCalledTimes(1);
  });

  it('does not call getAllTypes when explicit nodeTypes are provided', () => {
    registryGet.mockReturnValue(undefined);
    evaluateNodeBehaviorCoverage(['test_node']);
    expect(getAllTypes).not.toHaveBeenCalled();
  });

  it('skips node and counts it in totalNodes when registry returns undefined', () => {
    registryGet.mockReturnValue(undefined);
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.totalNodes).toBe(1);
    expect(report.totalFields).toBe(0);
    expect(report.evaluatedFields).toBe(0);
  });

  it('skips node when inputSchema is absent', () => {
    registryGet.mockReturnValue({ label: 'No Schema Node' });
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.totalNodes).toBe(1);
    expect(report.totalFields).toBe(0);
  });

  it('skips field when relevance is not found in analyzed result', () => {
    registryGet.mockReturnValue(makeNodeDef());
    analyze.mockReturnValue({ nodes: [{ fields: {}, operation: undefined }], fields: [] });
    validate.mockReturnValue([]);
    buildGuidance.mockReturnValue({});
    evalQuality.mockReturnValue({ passed: true, score: 1, issues: [] });
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.totalFields).toBe(1);
    expect(report.evaluatedFields).toBe(0);
  });

  it('increments fieldsWithFullIntelligence when field has runtimeBehavior, importance, and no missingFacts', () => {
    registryGet.mockReturnValue(makeNodeDef());
    setupHappyPath('myField');
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.fieldsWithFullIntelligence).toBe(1);
  });

  it('does not increment fieldsWithFullIntelligence when missingFacts is non-empty', () => {
    registryGet.mockReturnValue(makeNodeDef());
    setupHappyPath('myField', {
      guidanceQualitySignals: {
        specificity: 'fallback',
        usesStructuredMetadata: false,
        usesInferenceFallback: false,
        missingFacts: ['operation context missing'],
      },
    });
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.fieldsWithFullIntelligence).toBe(0);
  });

  it('increments fieldsUsingInferenceFallback when usesInferenceFallback is true', () => {
    registryGet.mockReturnValue(makeNodeDef());
    setupHappyPath('myField', {
      guidanceQualitySignals: {
        specificity: 'fallback',
        usesStructuredMetadata: false,
        usesInferenceFallback: true,
        missingFacts: [],
      },
    });
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.fieldsUsingInferenceFallback).toBe(1);
  });

  it('adds to unsafeGaps for required field with no validationHints and not schema-required', () => {
    registryGet.mockReturnValue(
      makeNodeDef({ myField: { type: 'string', fieldIntelligence: {} } })
    );
    setupHappyPath('myField', { relevance: 'required' });
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.unsafeGaps).toHaveLength(1);
    expect(report.unsafeGaps[0]).toMatchObject({ nodeType: 'test_node', fieldName: 'myField' });
  });

  it('does not add unsafeGap when field.required is set', () => {
    registryGet.mockReturnValue(
      makeNodeDef({ myField: { type: 'string', required: true, fieldIntelligence: {} } })
    );
    setupHappyPath('myField', { relevance: 'required' });
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.unsafeGaps).toHaveLength(0);
  });

  it('adds to riskyFieldsWithoutValidationHints for high-risk field with no validationHints', () => {
    registryGet.mockReturnValue(
      makeNodeDef({ myField: { type: 'string', fieldIntelligence: {} } })
    );
    setupHappyPath('myField', { relevance: 'optional', riskIfEmpty: 'high' });
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.riskyFieldsWithoutValidationHints).toHaveLength(1);
    expect(report.riskyFieldsWithoutValidationHints[0]).toMatchObject({
      nodeType: 'test_node',
      fieldName: 'myField',
    });
  });

  it('records guidanceQualityFailures when quality check does not pass', () => {
    registryGet.mockReturnValue(makeNodeDef());
    setupHappyPath();
    evalQuality.mockReturnValue({
      passed: false,
      score: 0.3,
      issues: [{ message: 'Too vague', severity: 'warning' }],
    });
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.guidanceQualityFailures).toHaveLength(1);
    expect(report.guidanceQualityFailures[0]).toMatchObject({
      nodeType: 'test_node',
      fieldName: 'myField',
      score: 0.3,
    });
  });

  it('produces 5 named test cases per evaluated field', () => {
    registryGet.mockReturnValue(makeNodeDef());
    setupHappyPath();
    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.fields).toHaveLength(1);
    const caseNames = report.fields[0].cases.map((c) => c.name);
    expect(caseNames).toEqual(['missing', 'empty_string', 'zero', 'null', 'valid_default']);
  });

  it('propagates highestSeverity from validate results into case entries', () => {
    registryGet.mockReturnValue(makeNodeDef());
    analyze.mockReturnValue({
      nodes: [{ fields: { myField: makeRelevance() }, operation: 'op' }],
      fields: [],
    });
    validate
      .mockReturnValueOnce([{ fieldName: 'myField', severity: 'error' }])
      .mockReturnValue([]);
    buildGuidance.mockReturnValue({});
    evalQuality.mockReturnValue({ passed: true, score: 1, issues: [] });

    const report = evaluateNodeBehaviorCoverage(['test_node']);
    expect(report.fields[0].cases[0].highestSeverity).toBe('error');
    expect(report.fields[0].cases[0].issueCount).toBe(1);
    expect(report.fields[0].cases[1].highestSeverity).toBeUndefined();
  });

  it('works when node has no defaultConfig method', () => {
    registryGet.mockReturnValue({
      label: 'No Default Config',
      inputSchema: {
        myField: {
          type: 'string',
          fieldIntelligence: { runtimeBehavior: { whenMissing: 'skip' }, importance: {} },
        },
      },
    });
    setupHappyPath();
    expect(() => evaluateNodeBehaviorCoverage(['test_node'])).not.toThrow();
  });
});
