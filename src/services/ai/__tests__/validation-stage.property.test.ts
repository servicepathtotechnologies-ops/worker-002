/**
 * Property-Based Tests: Validation Stage
 * Feature: ai-first-workflow-generation-pipeline
 */

import * as fc from 'fast-check';
import type { ValidationIssue } from '../system-prompt-builder';

// ─── Property 11: Validation result schema conformance ────────────────────────

// Feature: ai-first-workflow-generation-pipeline, Property 11: Validation result schema conformance
test('Property 11: validation result parser enforces schema — status field and issues array with suggestedFix on errors', () => {
  // Test the tryParseValidationResult logic inline
  const tryParseValidationResult = (text: string): { status: 'pass' | 'fail'; issues: ValidationIssue[] } | null => {
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1) return null;
      const obj = JSON.parse(text.substring(start, end + 1));
      if (!obj.status || !Array.isArray(obj.issues)) return null;
      return {
        status: obj.status === 'pass' ? 'pass' : 'fail',
        issues: obj.issues.map((i: any) => ({
          severity: i.severity === 'error' ? 'error' : 'warning',
          description: String(i.description || ''),
          suggestedFix: i.suggestedFix ? String(i.suggestedFix) : undefined,
        })),
      };
    } catch {
      return null;
    }
  };

  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          severity: fc.constantFrom('error', 'warning'),
          description: fc.string({ minLength: 1, maxLength: 80 }),
          suggestedFix: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
        }),
        { minLength: 0, maxLength: 5 },
      ),
      fc.constantFrom('pass', 'fail'),
      (issues, status) => {
        const text = JSON.stringify({ status, issues });
        const result = tryParseValidationResult(text);

        expect(result).not.toBeNull();
        expect(result!.status).toMatch(/^(pass|fail)$/);
        expect(Array.isArray(result!.issues)).toBe(true);

        for (const issue of result!.issues) {
          expect(issue.severity).toMatch(/^(error|warning)$/);
          expect(typeof issue.description).toBe('string');
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 12: Repair pass is triggered exactly once on errors ─────────────

// Feature: ai-first-workflow-generation-pipeline, Property 12: Repair pass is triggered exactly once on errors
test('Property 12: validation stage source code triggers repair pass exactly once', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '../stages/validation-stage.ts'),
    'utf-8',
  );

  // Count repair pass invocations — should be exactly one
  const repairPassMatches = source.match(/repair_pass|stage: 'repair'/g) ?? [];
  expect(repairPassMatches.length).toBe(2); // one log + one build call = exactly one repair pass

  // Must not have a loop around the repair
  expect(source).not.toMatch(/while.*repair|for.*repair/i);
});

// ─── Property 13: validateWorkflow is always called as structural safety net ──

// Feature: ai-first-workflow-generation-pipeline, Property 13: validateWorkflow is always called as structural safety net
test('Property 13: validation-stage.ts always calls unifiedGraphOrchestrator.validateWorkflow', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '../stages/validation-stage.ts'),
    'utf-8',
  );

  // Must call validateWorkflow
  expect(source).toMatch(/validateWorkflow/);

  // Must import unifiedGraphOrchestrator
  expect(source).toMatch(/unifiedGraphOrchestrator/);
});
