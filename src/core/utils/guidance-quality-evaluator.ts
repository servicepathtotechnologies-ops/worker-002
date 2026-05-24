import type { FieldRelevanceResult } from '../types/unified-node-contract';
import type { FieldGuidanceDescription } from './node-field-intelligence';

export interface GuidanceQualityIssue {
  severity: 'error' | 'warning' | 'info';
  code:
    | 'generic_guidance'
    | 'missing_risk'
    | 'missing_example'
    | 'contradicts_relevance'
    | 'missing_action'
    | 'fallback_intelligence';
  message: string;
}

export interface GuidanceQualityResult {
  score: number;
  passed: boolean;
  issues: GuidanceQualityIssue[];
}

const GENERIC_PATTERNS = [
  /adjusts optional behavior/i,
  /configures this node/i,
  /value for /i,
  /when it affects the result/i,
  /uses the node default or skips this optional behavior/i,
];

function textOf(guidance: FieldGuidanceDescription): string {
  return [
    guidance.what,
    guidance.needed,
    guidance.dataImpact,
    guidance.you,
    guidance.aiBuild,
    guidance.aiRun,
    guidance.example,
  ].join(' ');
}

function addIssue(
  issues: GuidanceQualityIssue[],
  severity: GuidanceQualityIssue['severity'],
  code: GuidanceQualityIssue['code'],
  message: string,
): void {
  issues.push({ severity, code, message });
}

export function evaluateGuidanceQuality(
  guidance: FieldGuidanceDescription,
  relevance?: FieldRelevanceResult,
): GuidanceQualityResult {
  const issues: GuidanceQualityIssue[] = [];
  const combined = textOf(guidance);

  if (GENERIC_PATTERNS.some((pattern) => pattern.test(combined))) {
    addIssue(issues, 'warning', 'generic_guidance', 'Guidance contains broad fallback wording instead of selected-workflow-specific behavior.');
  }

  if (!/^e\.g\./i.test(guidance.example.trim())) {
    addIssue(issues, 'warning', 'missing_example', 'Guidance example must start with a concrete e.g. value.');
  }

  if (relevance?.relevance === 'not_applicable' && !/leave|not used|not needed|ignored/i.test(guidance.needed)) {
    addIssue(issues, 'error', 'contradicts_relevance', 'Not-applicable fields must tell the user to leave the field off.');
  }

  if ((relevance?.relevance === 'required' || relevance?.riskIfEmpty === 'high') && /usually optional|safe to leave|optional behavior/i.test(guidance.needed)) {
    addIssue(issues, 'error', 'contradicts_relevance', 'Required or high-risk fields must not be described as optional or safe to leave empty.');
  }

  if ((relevance?.relevance === 'required' || relevance?.relevance === 'recommended') && !/turn|provide|enter|paste|set|review|connect|select/i.test(guidance.needed)) {
    addIssue(issues, 'warning', 'missing_action', 'Needed guidance should contain a direct user action.');
  }

  if ((relevance?.riskIfEmpty === 'high' || relevance?.wrongValueRisk) && !/wrong|empty|fail|risk|change|unusable|different|cannot/i.test(combined)) {
    addIssue(issues, 'warning', 'missing_risk', 'Risky fields should explain what happens when the value is empty or wrong.');
  }

  if (relevance?.guidanceQualitySignals?.usesInferenceFallback) {
    addIssue(issues, 'info', 'fallback_intelligence', 'Field relevance used conservative inference because structured metadata is incomplete.');
  }

  const penalty = issues.reduce((sum, issue) => {
    if (issue.severity === 'error') return sum + 35;
    if (issue.severity === 'warning') return sum + 15;
    return sum + 5;
  }, 0);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    passed: !issues.some((issue) => issue.severity === 'error') && score >= 70,
    issues,
  };
}
