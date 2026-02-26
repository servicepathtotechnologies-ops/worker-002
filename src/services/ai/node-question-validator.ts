/**
 * Node Question Validator
 * Validates answers to node questions with type checking and custom validation
 */

import { QuestionDefinition } from './node-question-order';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a single answer against its question definition
 */
export function validateAnswer(
  question: QuestionDefinition,
  answer: any
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required
  if (question.required) {
    if (answer === undefined || answer === null || answer === '') {
      errors.push(`${question.prompt} is required`);
      return { valid: false, errors, warnings };
    }
  } else if (answer === undefined || answer === null || answer === '') {
    // Optional field is empty - that's fine
    return { valid: true, errors: [], warnings: [] };
  }

  // Type validation
  switch (question.type) {
    case 'string':
    case 'email':
      if (typeof answer !== 'string') {
        errors.push(`${question.prompt} must be a string`);
      } else if (question.type === 'email' && !isValidEmail(answer)) {
        errors.push(`${question.prompt} must be a valid email address`);
      }
      break;

    case 'number':
      if (typeof answer !== 'number' || isNaN(answer)) {
        errors.push(`${question.prompt} must be a number`);
      }
      break;

    case 'boolean':
      if (typeof answer !== 'boolean') {
        // Allow string 'true'/'false' to be converted
        if (answer === 'true' || answer === 'false') {
          // Valid, but should be converted to boolean by caller
          warnings.push(`${question.prompt} should be a boolean, not a string`);
        } else {
          errors.push(`${question.prompt} must be true or false`);
        }
      }
      break;

    case 'select':
      const validOptions = question.options?.map(opt => opt.value) || [];
      if (!validOptions.includes(answer)) {
        errors.push(
          `${question.prompt} must be one of: ${validOptions.join(', ')}`
        );
      }
      break;

    case 'json':
      if (typeof answer === 'string') {
        try {
          JSON.parse(answer);
        } catch {
          errors.push(`${question.prompt} must be valid JSON`);
        }
      } else if (typeof answer !== 'object' || answer === null) {
        // Allow objects and arrays, but not null (null is handled above)
        errors.push(`${question.prompt} must be a JSON object, array, or string`);
      }
      break;

    case 'datetime':
      if (typeof answer !== 'string' || !isValidDateTime(answer)) {
        errors.push(
          `${question.prompt} must be a valid ISO datetime (e.g. 2026-02-16T09:00:00Z)`
        );
      }
      break;

    case 'code':
      if (typeof answer !== 'string') {
        errors.push(`${question.prompt} must be a code string`);
      }
      break;

    case 'credential':
      if (typeof answer !== 'string' || answer.trim() === '') {
        errors.push(`${question.prompt} must be a valid credential ID`);
      }
      break;
  }

  // Custom validation from question definition
  if (question.description?.includes('max') && question.type === 'string') {
    const maxMatch = question.description.match(/max (\d+)/i);
    if (maxMatch && typeof answer === 'string') {
      const maxLength = parseInt(maxMatch[1], 10);
      if (answer.length > maxLength) {
        errors.push(`${question.prompt} must be ${maxLength} characters or less`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate all answers for a node
 */
export function validateAllAnswers(
  questions: QuestionDefinition[],
  answers: Record<string, any>
): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (const question of questions) {
    const answer = answers[question.field];
    const result = validateAnswer(question, answer);
    
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate datetime format (ISO 8601)
 */
function isValidDateTime(datetime: string): boolean {
  const date = new Date(datetime);
  return !isNaN(date.getTime()) && datetime.includes('T');
}

/**
 * Validate cron expression
 */
export function validateCron(cron: string): ValidationResult {
  const errors: string[] = [];
  
  // Basic cron validation: 5 fields separated by spaces
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    errors.push('Cron expression must have 5 fields: minute hour day month weekday');
  }

  // Validate each field
  const ranges = [
    { min: 0, max: 59 }, // minute
    { min: 0, max: 23 }, // hour
    { min: 1, max: 31 }, // day
    { min: 1, max: 12 }, // month
    { min: 0, max: 6 },  // weekday
  ];

  for (let i = 0; i < Math.min(parts.length, 5); i++) {
    const part = parts[i];
    const { min, max } = ranges[i];

    // Allow wildcards, ranges, and lists
    if (part === '*' || part.includes('/') || part.includes('-') || part.includes(',')) {
      continue; // Complex expressions - assume valid for now
    }

    // Check if it's a number in range
    const num = parseInt(part, 10);
    if (isNaN(num) || num < min || num > max) {
      errors.push(`Field ${i + 1} must be between ${min} and ${max}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

/**
 * Validate phone number (E.164 format for WhatsApp)
 */
export function validatePhoneNumber(phone: string): ValidationResult {
  const errors: string[] = [];
  
  // E.164 format: +[country code][number]
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  
  if (!e164Regex.test(phone)) {
    errors.push('Phone number must be in E.164 format (e.g. +1234567890)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

/**
 * Validate GitHub repository format (owner/repo)
 */
export function validateGitHubRepo(repo: string): ValidationResult {
  const errors: string[] = [];
  
  const repoRegex = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
  
  if (!repoRegex.test(repo)) {
    errors.push('Repository must be in format: owner/repo-name');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}
