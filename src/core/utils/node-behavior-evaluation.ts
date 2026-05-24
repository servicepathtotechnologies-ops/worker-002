import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { buildFieldGuidanceDescription, validateWorkflowNodeIntelligence } from './node-field-intelligence';
import { evaluateGuidanceQuality, type GuidanceQualityIssue } from './guidance-quality-evaluator';
import {
  analyzeSelectedWorkflowIntelligence,
  type SelectedWorkflowFieldIntelligence,
} from './selected-workflow-intelligence';

export interface NodeBehaviorFieldEvaluation {
  nodeType: string;
  fieldName: string;
  relevance: SelectedWorkflowFieldIntelligence['relevance'];
  cases: Array<{
    name: 'missing' | 'empty_string' | 'zero' | 'null' | 'valid_default';
    issueCount: number;
    highestSeverity?: 'error' | 'warning' | 'info';
  }>;
}

export interface NodeBehaviorEvaluationReport {
  totalNodes: number;
  totalFields: number;
  evaluatedFields: number;
  fieldsWithFullIntelligence: number;
  fieldsUsingInferenceFallback: number;
  unsafeGaps: Array<{ nodeType: string; fieldName: string; reason: string }>;
  riskyFieldsWithoutValidationHints: Array<{ nodeType: string; fieldName: string; reason: string }>;
  guidanceQualityFailures: Array<{
    nodeType: string;
    fieldName: string;
    score: number;
    issues: GuidanceQualityIssue[];
  }>;
  fields: NodeBehaviorFieldEvaluation[];
}

function severityRank(severity: 'error' | 'warning' | 'info'): number {
  if (severity === 'error') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

function highestSeverity(issues: Array<{ severity: 'error' | 'warning' | 'info' }>): 'error' | 'warning' | 'info' | undefined {
  return issues
    .map((issue) => issue.severity)
    .sort((a, b) => severityRank(b) - severityRank(a))[0];
}

function sampleValueForType(type: string): unknown {
  if (type === 'number') return 1;
  if (type === 'boolean') return true;
  if (type === 'array') return ['sample'];
  if (type === 'object' || type === 'json') return { sample: true };
  return 'sample';
}

export function evaluateNodeBehaviorCoverage(nodeTypes?: string[]): NodeBehaviorEvaluationReport {
  const allNodeTypes = nodeTypes?.length ? nodeTypes : unifiedNodeRegistry.getAllTypes();
  const fields: NodeBehaviorFieldEvaluation[] = [];
  const unsafeGaps: NodeBehaviorEvaluationReport['unsafeGaps'] = [];
  const riskyFieldsWithoutValidationHints: NodeBehaviorEvaluationReport['riskyFieldsWithoutValidationHints'] = [];
  const guidanceQualityFailures: NodeBehaviorEvaluationReport['guidanceQualityFailures'] = [];
  let totalFields = 0;
  let fieldsWithFullIntelligence = 0;
  let fieldsUsingInferenceFallback = 0;

  for (const nodeType of allNodeTypes) {
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def?.inputSchema) continue;
    const baseConfig = def.defaultConfig?.() || {};
    const baseNode = {
      id: `${nodeType}_node`,
      type: nodeType,
      data: { type: nodeType, label: def.label || nodeType, config: baseConfig },
    };
    const workflow = { nodes: [baseNode], edges: [] };
    const selected = analyzeSelectedWorkflowIntelligence(workflow);
    totalFields += Object.keys(def.inputSchema).length;

    for (const [fieldName, field] of Object.entries(def.inputSchema)) {
      const relevance = selected.nodes[0]?.fields[fieldName];
      if (!relevance) continue;
      if (!relevance.guidanceQualitySignals?.missingFacts?.length && field.fieldIntelligence?.runtimeBehavior && field.fieldIntelligence?.importance) {
        fieldsWithFullIntelligence += 1;
      }
      if (relevance.guidanceQualitySignals?.usesInferenceFallback) fieldsUsingInferenceFallback += 1;

      const cases = [
        { name: 'missing' as const, omit: true, value: undefined },
        { name: 'empty_string' as const, value: '' },
        { name: 'zero' as const, value: 0 },
        { name: 'null' as const, value: null },
        { name: 'valid_default' as const, value: field.default ?? sampleValueForType(field.type) },
      ].map((testCase) => {
        const config = { ...baseConfig };
        if (!testCase.omit) (config as Record<string, unknown>)[fieldName] = testCase.value;
        const issues = validateWorkflowNodeIntelligence({
          nodes: [
            {
              ...baseNode,
              data: { ...baseNode.data, config },
            },
          ],
          edges: [],
        });
        const fieldIssues = issues.filter((issue) => issue.fieldName === fieldName);
        return {
          name: testCase.name,
          issueCount: fieldIssues.length,
          highestSeverity: highestSeverity(fieldIssues),
        };
      });

      if (
        relevance.relevance === 'required' &&
        !field.fieldIntelligence?.validationHints?.length &&
        !field.required &&
        !field.ui?.requiredIf
      ) {
        unsafeGaps.push({
          nodeType,
          fieldName,
          reason: 'Field is relevant as required but has no explicit validation hint or schema requirement.',
        });
      }

      if (
        relevance.relevance !== 'not_applicable' &&
        (relevance.riskIfEmpty === 'high' || field.fieldIntelligence?.importance?.dangerousIfEmpty) &&
        !field.fieldIntelligence?.validationHints?.length
      ) {
        riskyFieldsWithoutValidationHints.push({
          nodeType,
          fieldName,
          reason: 'Applicable high-risk field has no validation hints.',
        });
      }

      const guidance = buildFieldGuidanceDescription({
        nodeType,
        nodeLabel: def.label || nodeType,
        fieldName,
        field,
        operation: selected.nodes[0]?.operation,
        fieldRelevance: relevance,
      });
      const guidanceQuality = evaluateGuidanceQuality(guidance, relevance);
      if (!guidanceQuality.passed) {
        guidanceQualityFailures.push({
          nodeType,
          fieldName,
          score: guidanceQuality.score,
          issues: guidanceQuality.issues,
        });
      }

      fields.push({ nodeType, fieldName, relevance, cases });
    }
  }

  return {
    totalNodes: allNodeTypes.length,
    totalFields,
    evaluatedFields: fields.length,
    fieldsWithFullIntelligence,
    fieldsUsingInferenceFallback,
    unsafeGaps,
    riskyFieldsWithoutValidationHints,
    guidanceQualityFailures,
    fields,
  };
}
