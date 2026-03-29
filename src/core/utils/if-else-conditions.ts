export type IfElseOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'contains'
  | 'not_contains';

export interface IfElseCondition {
  field: string;
  operator: IfElseOperator;
  value: unknown;
}

const OPERATOR_ALIASES: Record<string, IfElseOperator> = {
  '==': 'equals',
  '===': 'equals',
  equals: 'equals',
  '!=': 'not_equals',
  '!==': 'not_equals',
  not_equals: 'not_equals',
  '>': 'greater_than',
  greater_than: 'greater_than',
  '<': 'less_than',
  less_than: 'less_than',
  '>=': 'greater_than_or_equal',
  greater_than_or_equal: 'greater_than_or_equal',
  '<=': 'less_than_or_equal',
  less_than_or_equal: 'less_than_or_equal',
  contains: 'contains',
  not_contains: 'not_contains',
};

const EXPRESSION_PATTERNS: Array<{ regex: RegExp; operator: IfElseOperator }> = [
  { regex: /(.+?)\s*(>=)\s*(.+)/, operator: 'greater_than_or_equal' },
  { regex: /(.+?)\s*(<=)\s*(.+)/, operator: 'less_than_or_equal' },
  { regex: /(.+?)\s*(===|==)\s*(.+)/, operator: 'equals' },
  { regex: /(.+?)\s*(!==|!=)\s*(.+)/, operator: 'not_equals' },
  { regex: /(.+?)\s*(>)\s*(.+)/, operator: 'greater_than' },
  { regex: /(.+?)\s*(<)\s*(.+)/, operator: 'less_than' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeFieldPath(raw: string): string {
  const trimmed = raw.trim();
  const withoutTemplate = trimmed
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '');
  return withoutTemplate;
}

function parseLiteral(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (!Number.isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function tryParseJson(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const likelyJson =
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'));
  if (!likelyJson) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function parseExpression(expression: string): IfElseCondition | null {
  const parsedJson = tryParseJson(expression);
  if (parsedJson !== undefined) {
    const normalizedFromJson = normalizeIfElseConditions(parsedJson);
    if (normalizedFromJson.length > 0) return normalizedFromJson[0];
  }

  const normalizedExpr = expression.trim();
  for (const pattern of EXPRESSION_PATTERNS) {
    const match = normalizedExpr.match(pattern.regex);
    if (!match) continue;
    return {
      field: sanitizeFieldPath(match[1]),
      operator: pattern.operator,
      value: parseLiteral(match[3]),
    };
  }
  return null;
}

function normalizeSingleCondition(input: unknown): IfElseCondition | null {
  if (typeof input === 'string') {
    const parsedJson = tryParseJson(input);
    if (parsedJson !== undefined) {
      const normalized = normalizeIfElseConditions(parsedJson);
      return normalized.length > 0 ? normalized[0] : null;
    }
    return parseExpression(input);
  }

  if (!isRecord(input)) return null;

  if (typeof input.field === 'string' && typeof input.operator === 'string') {
    const operator = OPERATOR_ALIASES[input.operator];
    if (!operator) return null;
    return {
      field: sanitizeFieldPath(input.field),
      operator,
      value: input.value,
    };
  }

  if (typeof input.leftValue === 'string' && typeof input.operation === 'string') {
    const operator = OPERATOR_ALIASES[input.operation];
    if (!operator) return null;
    return {
      field: sanitizeFieldPath(input.leftValue),
      operator,
      value: input.rightValue,
    };
  }

  if (typeof input.expression === 'string') {
    return parseExpression(input.expression);
  }

  return null;
}

export function normalizeIfElseConditions(input: unknown): IfElseCondition[] {
  if (input === undefined || input === null) return [];

  const values = Array.isArray(input) ? input : [input];
  const normalized: IfElseCondition[] = [];

  for (const value of values) {
    const condition = normalizeSingleCondition(value);
    if (condition && condition.field) {
      normalized.push(condition);
    }
  }

  return normalized;
}

export function normalizeIfElseConfig(config: Record<string, unknown>): Record<string, unknown> {
  const normalizedConfig = { ...config };
  const source = normalizedConfig.conditions ?? normalizedConfig.condition;
  const conditions = normalizeIfElseConditions(source);

  normalizedConfig.conditions = conditions;
  delete normalizedConfig.condition;

  const combineRaw = normalizedConfig.combineOperation;
  const combineUpper =
    typeof combineRaw === 'string' ? combineRaw.toUpperCase() : 'AND';
  normalizedConfig.combineOperation = combineUpper === 'OR' ? 'OR' : 'AND';

  return normalizedConfig;
}

export function validateCanonicalIfElseConditions(conditions: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(conditions)) {
    errors.push('conditions must be an array');
    return errors;
  }
  if (conditions.length === 0) {
    errors.push('conditions must contain at least one condition');
    return errors;
  }

  conditions.forEach((condition, index) => {
    if (!isRecord(condition)) {
      errors.push(`conditions[${index}] must be an object`);
      return;
    }
    if (typeof condition.field !== 'string' || !condition.field.trim()) {
      errors.push(`conditions[${index}].field must be a non-empty string`);
    }
    if (
      typeof condition.operator !== 'string' ||
      !OPERATOR_ALIASES[condition.operator]
    ) {
      errors.push(`conditions[${index}].operator is invalid`);
    }
    if (!Object.prototype.hasOwnProperty.call(condition, 'value')) {
      errors.push(`conditions[${index}].value is required`);
    }
  });

  return errors;
}
