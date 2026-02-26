/**
 * Typed Condition Evaluator
 * 
 * Evaluates conditions with proper type handling.
 * Ensures numeric comparisons work correctly (20 > 10, not "20" > "10").
 */

import { ExecutionContext, getContextValue, getAllNodeOutputs } from './typed-execution-context';
import { resolveTypedValue, resolveWithSchema } from './typed-value-resolver';
import { getNestedValue } from '../utils/object-utils';

export interface Condition {
  leftValue: string | unknown;
  operation: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'greater_than_or_equal' | 'less_than_or_equal' | 'contains' | 'not_contains';
  rightValue: string | unknown;
}

/**
 * Evaluate a condition with proper type handling
 */
export function evaluateCondition(
  condition: Condition | string,
  context: ExecutionContext
): boolean {
  // If condition is a string expression, parse it
  if (typeof condition === 'string') {
    return evaluateExpression(condition, context);
  }
  
  // Extract left and right values
  const leftRaw = typeof condition.leftValue === 'string'
    ? resolveTypedValue(condition.leftValue, context)
    : condition.leftValue;
  
  const rightRaw = typeof condition.rightValue === 'string'
    ? resolveTypedValue(condition.rightValue, context)
    : condition.rightValue;
  
  // ✅ CORE FIX: coerce numeric/boolean literal strings (e.g. "10", "0", "true")
  // resolveTypedValue() returns non-template strings as-is, so numeric literals would otherwise
  // be treated as strings and ">" comparisons would incorrectly return false.
  const leftCoerced = coerceLiteralScalar(leftRaw);
  const rightCoerced = coerceLiteralScalar(rightRaw);

  // Determine types and compare
  const leftType = inferType(leftCoerced);
  const rightType = inferType(rightCoerced);
  
  // If both are numbers, compare as numbers
  if (leftType === 'number' && rightType === 'number') {
    return compareNumbers(
      leftCoerced as number,
      rightCoerced as number,
      condition.operation
    );
  }
  
  // If both are strings, compare as strings
  if (leftType === 'string' && rightType === 'string') {
    // ✅ TYPE SAFETY (CORE CONTRACT)
    // Do not perform lexicographic ordering for "greater/less than" comparisons on strings.
    // Strings should use equals/contains semantics; ordering comparisons are undefined/unsafe.
    if (
      condition.operation === 'greater_than' ||
      condition.operation === 'less_than' ||
      condition.operation === 'greater_than_or_equal' ||
      condition.operation === 'less_than_or_equal'
    ) {
      return false;
    }

    return compareStrings(
      leftCoerced as string,
      rightCoerced as string,
      condition.operation
    );
  }
  
  // If both are booleans, compare as booleans
  if (leftType === 'boolean' && rightType === 'boolean') {
    return compareBooleans(
      leftCoerced as boolean,
      rightCoerced as boolean,
      condition.operation
    );
  }
  
  // Mixed types - convert to strings for comparison
  const leftStr = String(leftCoerced);
  const rightStr = String(rightCoerced);
  return compareStrings(leftStr, rightStr, condition.operation);
}

/**
 * Evaluate a JavaScript expression with type awareness
 */
function evaluateExpression(
  expression: string,
  context: ExecutionContext
): boolean {
  // ✅ FIX: Handle expressions with template variables AND operators
  // Example: "{{$json.items.length > 0}}"
  // We need to extract template parts, resolve them, then evaluate the expression
  
  // Check if expression contains template syntax AND operators
  const hasTemplate = expression.includes('{{');
  const hasOperator = /[><=!]/.test(expression);
  
  if (hasTemplate && hasOperator) {
    // Extract and resolve template variables first
    let evalExpr = expression;
    evalExpr = evalExpr.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim();
      
      // ✅ CORE ARCHITECTURE FIX: Extract ONLY the variable path, not operators
      // Example: "{{$json.items.length}} > 0" should extract "$json.items.length", not "$json.items.length > 0"
      // The regex already extracted the content inside {{}}, but it might include operators
      // Split by operators to get just the variable path
      const operatorMatch = trimmedPath.match(/^(.+?)\s*([><=!]+|&&|\|\|)/);
      const variablePath = operatorMatch ? operatorMatch[1].trim() : trimmedPath;
      
      // ✅ DEBUG: Log path extraction for debugging
      if (process.env.DEBUG_DATA_FLOW === 'true') {
        console.log('[evaluateExpression] 🔍 Path extraction:', {
          originalPath: trimmedPath,
          extractedVariablePath: variablePath,
          hasOperator: !!operatorMatch,
        });
      }
      
      // ✅ CORE ARCHITECTURE FIX: getContextValue now handles array.length correctly
      // So we can directly use the resolved value
      const value = getContextValue(context, variablePath);
      
      if (value === undefined || value === null) {
        // ✅ DEBUG: Log when value is undefined to help diagnose issues
        if (process.env.DEBUG_DATA_FLOW === 'true') {
          console.log('[evaluateExpression] ⚠️ Value undefined for path:', variablePath, {
            contextVariables: Object.keys(context.variables),
            has$json: !!context.variables.$json,
            hasJson: !!context.variables.json,
            $jsonKeys: context.variables.$json && typeof context.variables.$json === 'object' 
              ? Object.keys(context.variables.$json as Record<string, unknown>)
              : [],
          });
        }
        return 'undefined';
      }
      
      // ✅ FIX: For numbers and booleans, use them directly (no string conversion needed for evaluation)
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      
      // ✅ FIX: For strings, quote them for safe evaluation
      if (typeof value === 'string') {
        return JSON.stringify(value);
      }
      
      // ✅ FIX: Arrays should already be resolved to their length if path ends with .length
      // But handle edge case where array is returned instead of length
      if (Array.isArray(value)) {
        // If path ends with .length but we got the array, return its length
        if (variablePath.endsWith('.length')) {
          return String(value.length);
        }
        // Otherwise, stringify the array
        return JSON.stringify(value);
      }
      
      // ✅ FIX: For objects, stringify (but this shouldn't happen for .length paths)
      return JSON.stringify(value);
    });
    
    // ✅ DEBUG: Log resolved expression for debugging
    if (process.env.DEBUG_DATA_FLOW === 'true') {
      console.log('[evaluateExpression] Resolved expression:', {
        original: expression,
        resolved: evalExpr,
      });
    }
    
    // Now evaluate the resolved expression
    return evaluateStringExpression(evalExpr, context);
  }
  
  // Original logic for non-template expressions or expressions without operators
  const resolved = resolveTypedValue(expression, context);
  
  // If resolved to a boolean, return it
  if (typeof resolved === 'boolean') {
    return resolved;
  }
  
  // If resolved to a string that looks like an expression, evaluate it
  if (typeof resolved === 'string') {
    return evaluateStringExpression(resolved, context);
  }
  
  // Otherwise, treat as truthy/falsy
  return Boolean(resolved);
}

/**
 * Evaluate a string expression with proper operator handling
 */
function evaluateStringExpression(
  expression: string,
  context: ExecutionContext
): boolean {
  const expr = expression.trim();
  
  // Handle simple boolean strings
  if (expr === 'true' || expr === '1') return true;
  if (expr === 'false' || expr === '0') return false;

  // ✅ MODULO FIRST (CORE CORRECTNESS)
  // Expressions like "20 % 2 === 0" were being mis-parsed as a plain equality with a left operand
  // of "20 % 2", which then got coerced incorrectly. Handle modulo before generic comparisons.
  if (expr.includes('%')) {
    const modResult = evaluateModuloExpression(expr, context);
    // If it matched a modulo pattern, return the evaluated result; otherwise continue parsing.
    // (evaluateModuloExpression returns false when it can't match)
    if (/[%].*(===|==|!==|!=|>|<|>=|<=)/.test(expr)) {
      return modResult;
    }
  }
  
  // Try to parse as comparison expression
  const comparison = parseComparison(expr);
  if (comparison) {
    const left = coerceLiteralScalar(resolveTypedValue(comparison.left, context));
    const right = coerceLiteralScalar(resolveTypedValue(comparison.right, context));
    
    const leftType = inferType(left);
    const rightType = inferType(right);
    
    // Numeric comparison
    if (leftType === 'number' && rightType === 'number') {
      return compareNumbers(left as number, right as number, comparison.op);
    }
    
    // String comparison
    if (leftType === 'string' && rightType === 'string') {
      // ✅ TYPE SAFETY (CORE CONTRACT)
      // Do not perform lexicographic ordering for "greater/less than" comparisons on strings.
      // Users should use equals/contains for strings. This prevents surprising behavior like:
      // "20" > "10" === true (lexicographic) when values are strings.
      if (
        comparison.op === 'greater_than' ||
        comparison.op === 'less_than' ||
        comparison.op === 'greater_than_or_equal' ||
        comparison.op === 'less_than_or_equal'
      ) {
        return false;
      }
      return compareStrings(left as string, right as string, comparison.op);
    }

    // Fallback to string comparison
    return compareStrings(String(left), String(right), comparison.op);
  }
  
  // If parseComparison failed, log a warning
  console.warn('[ConditionEvaluator] Could not parse comparison expression:', expr);
  
  // Last resort: safe eval
  try {
    // First, try to resolve any remaining template variables in the expression
    // This handles cases where the expression wasn't fully resolved earlier
    let evalExpr = expr;
    const allOutputs = getAllNodeOutputs(context);
    
    // Replace any remaining {{...}} patterns
    evalExpr = evalExpr.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim();
      const value = getContextValue(context, trimmedPath);
      if (value === undefined || value === null) {
        return 'undefined';
      }
      // For numbers and booleans, use them directly; for strings, quote them
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      if (typeof value === 'string') {
        return JSON.stringify(value);
      }
      return JSON.stringify(value);
    });
    
    const safeEval = new Function('return ' + evalExpr);
    const result = safeEval();
    return Boolean(result);
  } catch (error) {
    // If eval fails, log the error and return false (safer than returning true)
    console.warn('[ConditionEvaluator] Failed to evaluate expression:', expr, error);
    return false;
  }
}

/**
 * Coerce scalar literal strings into native types when safe.
 *
 * IMPORTANT: This only coerces when the entire string is a literal (e.g. "10", "-3.14", "true").
 * It will NOT coerce quoted strings (e.g. "\"10\"") or mixed strings (e.g. "10px").
 */
function coerceLiteralScalar(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return value;

  const lower = trimmed.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (lower === 'null') return null;
  if (lower === 'undefined') return undefined;

  // Strict numeric literal (int/float). Avoid coercing things like "01-02" or "10px".
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : value;
  }

  return value;
}

/**
 * Parse a comparison expression (e.g., "age >= 18", "status === 'active'")
 */
function parseComparison(expr: string): { left: string; op: Condition['operation']; right: string } | null {
  // Match operators: ===, ==, !==, !=, >=, <=, >, <
  const patterns = [
    { regex: /(.+?)\s*(===|==)\s*(.+)/, op: 'equals' as const },
    { regex: /(.+?)\s*(!==|!=)\s*(.+)/, op: 'not_equals' as const },
    { regex: /(.+?)\s*(>=)\s*(.+)/, op: 'greater_than_or_equal' as const },
    { regex: /(.+?)\s*(<=)\s*(.+)/, op: 'less_than_or_equal' as const },
    { regex: /(.+?)\s*(>)\s*(.+)/, op: 'greater_than' as const },
    { regex: /(.+?)\s*(<)\s*(.+)/, op: 'less_than' as const },
  ];
  
  for (const pattern of patterns) {
    const match = expr.match(pattern.regex);
    if (match) {
      return {
        left: match[1].trim(),
        op: pattern.op,
        right: match[2] === '===' || match[2] === '==' ? match[3].trim() : match[3].trim(),
      };
    }
  }
  
  return null;
}

/**
 * Evaluate modulo expression (e.g., "20 % 2 === 0")
 */
function evaluateModuloExpression(
  expr: string,
  context: ExecutionContext
): boolean {
  // Extract modulo pattern: "X % Y === Z"
  const moduloPattern = /([\d.]+|\{\{[^}]+\}\}|[a-zA-Z_][a-zA-Z0-9_]*)\s*%\s*([\d.]+)\s*(===|==|!==|!=|>|<|>=|<=)\s*([\d.]+)/;
  const match = expr.match(moduloPattern);
  
  if (match) {
    const [, leftStr, modStr, operator, rightStr] = match;
    
    // Resolve left value
    const leftRaw = leftStr.includes('{{') 
      ? resolveTypedValue(leftStr, context)
      : parseFloat(leftStr);
    const left = toNumber(leftRaw);
    
    const mod = parseFloat(modStr) || 2;
    const right = parseFloat(rightStr) || 0;
    
    const result = left % mod;
    
    // Map operator to comparison
    const opMap: Record<string, Condition['operation']> = {
      '===': 'equals',
      '==': 'equals',
      '!==': 'not_equals',
      '!=': 'not_equals',
      '>': 'greater_than',
      '<': 'less_than',
      '>=': 'greater_than_or_equal',
      '<=': 'less_than_or_equal',
    };
    
    const op = opMap[operator] || 'equals';
    return compareNumbers(result, right, op);
  }
  
  return false;
}

/**
 * Compare numbers with operation
 */
function compareNumbers(
  left: number,
  right: number,
  operation: Condition['operation']
): boolean {
  switch (operation) {
    case 'equals':
      return left === right;
    case 'not_equals':
      return left !== right;
    case 'greater_than':
      return left > right;
    case 'less_than':
      return left < right;
    case 'greater_than_or_equal':
      return left >= right;
    case 'less_than_or_equal':
      return left <= right;
    default:
      return false;
  }
}

/**
 * Compare strings with operation
 */
function compareStrings(
  left: string,
  right: string,
  operation: Condition['operation']
): boolean {
  switch (operation) {
    case 'equals':
      return left === right;
    case 'not_equals':
      return left !== right;
    case 'contains':
      return left.includes(right);
    case 'not_contains':
      return !left.includes(right);
    case 'greater_than':
      return left > right;
    case 'less_than':
      return left < right;
    case 'greater_than_or_equal':
      return left >= right;
    case 'less_than_or_equal':
      return left <= right;
    default:
      return false;
  }
}

/**
 * Compare booleans
 */
function compareBooleans(
  left: boolean,
  right: boolean,
  operation: Condition['operation']
): boolean {
  switch (operation) {
    case 'equals':
      return left === right;
    case 'not_equals':
      return left !== right;
    default:
      return false;
  }
}

/**
 * Infer type of a value
 */
function inferType(value: unknown): 'number' | 'string' | 'boolean' | 'object' | 'array' {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && value !== null) return 'object';
  return 'string'; // default
}

/**
 * Convert value to number
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}
