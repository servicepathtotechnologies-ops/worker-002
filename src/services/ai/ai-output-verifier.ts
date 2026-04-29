export interface SelfCheckAttempt {
  attempt: number;
  valid: boolean;
  issues: string[];
  action: 'none' | 'repair';
}

export interface SelfCheckResult {
  finalValid: boolean;
  repairedOutput: unknown;
  attempts: SelfCheckAttempt[];
  expectedType?: string;
}

interface VerifierParams {
  output: unknown;
  outputSchema: any;
  maxAttempts: number;
}

function getExpectedType(outputSchema: any): string | undefined {
  const defaultPort = outputSchema?.default;
  return defaultPort?.schema?.type;
}

function validateOutput(output: unknown, outputSchema: any): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const expectedType = getExpectedType(outputSchema);
  if (!expectedType) {
    return { valid: true, issues };
  }

  const actualType = Array.isArray(output) ? 'array' : typeof output;
  if (expectedType === 'object') {
    if (output === null || Array.isArray(output) || typeof output !== 'object') {
      issues.push(`Expected object output, got ${actualType}`);
    }
  } else if (expectedType === 'array') {
    if (!Array.isArray(output)) {
      issues.push(`Expected array output, got ${actualType}`);
    }
  } else if (actualType !== expectedType) {
    issues.push(`Expected ${expectedType} output, got ${actualType}`);
  }

  return { valid: issues.length === 0, issues };
}

function applyHeuristicRepair(output: unknown, outputSchema: any): unknown {
  const expectedType = getExpectedType(outputSchema);
  if (!expectedType) return output;

  if (expectedType === 'object') {
    if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
      return output;
    }
    if (typeof output === 'string') {
      try {
        const parsed = JSON.parse(output);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // Fall through to value wrapping.
      }
      return { message: output };
    }
    if (Array.isArray(output)) {
      return { items: output };
    }
    return { value: output };
  }

  if (expectedType === 'array') {
    return Array.isArray(output) ? output : [output];
  }

  if (expectedType === 'string') {
    if (typeof output === 'string') return output;
    if (output === null || output === undefined) return '';
    try {
      return typeof output === 'object' ? JSON.stringify(output) : String(output);
    } catch {
      return String(output);
    }
  }

  if (expectedType === 'number') {
    if (typeof output === 'number') return output;
    const parsed = Number(output);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (expectedType === 'boolean') {
    if (typeof output === 'boolean') return output;
    if (typeof output === 'string') {
      const normalized = output.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
      if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    }
    return Boolean(output);
  }

  return output;
}

export async function verifyAndRepairNodeOutput(params: VerifierParams): Promise<SelfCheckResult> {
  const { output, outputSchema, maxAttempts } = params;
  const attempts: SelfCheckAttempt[] = [];
  const boundedAttempts = Math.max(1, maxAttempts);
  let currentOutput = output;

  for (let attempt = 1; attempt <= boundedAttempts; attempt++) {
    const validation = validateOutput(currentOutput, outputSchema);
    attempts.push({
      attempt,
      valid: validation.valid,
      issues: validation.issues,
      action: validation.valid ? 'none' : 'repair',
    });

    if (validation.valid) {
      return {
        finalValid: true,
        repairedOutput: currentOutput,
        attempts,
        expectedType: getExpectedType(outputSchema),
      };
    }

    currentOutput = applyHeuristicRepair(currentOutput, outputSchema);
  }

  const finalValidation = validateOutput(currentOutput, outputSchema);
  return {
    finalValid: finalValidation.valid,
    repairedOutput: currentOutput,
    attempts,
    expectedType: getExpectedType(outputSchema),
  };
}
