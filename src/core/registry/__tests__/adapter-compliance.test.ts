import fs from 'fs';
import path from 'path';

describe('adapter compliance', () => {
  const overridesDir = path.resolve(__dirname, '..', 'overrides');
  const adapterFiles = fs
    .readdirSync(overridesDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => path.join(overridesDir, file));

  const structuralExceptions = new Set([
    'chat-trigger.ts',
    'if-else.ts',
    'merge.ts',
    'parallel.ts',
    'retry.ts',
    'set-variable.ts',
    'switch.ts',
    'try-catch.ts',
    'timeout.ts',
  ]);

  it('does not merge raw inputs after config inside provider adapters', () => {
    const violations: string[] = [];
    for (const filePath of adapterFiles) {
      const source = fs.readFileSync(filePath, 'utf8');
      if (/\{\s*\.\.\.context\.inputs\s*,\s*\.\.\.context\.config\s*\}/s.test(source)) {
        violations.push(path.basename(filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it('does not report universal runtime-owned fields as adapter missing inputs', () => {
    const runtimeOwnedMissingPattern =
      /_missingInputs\s*:\s*\[[^\]]*['"`](recipientEmails|subject|body|values|data|conditions|cases|code|query|filters|rows)['"`]/;
    const violations: string[] = [];

    for (const filePath of adapterFiles) {
      const source = fs.readFileSync(filePath, 'utf8');
      if (runtimeOwnedMissingPattern.test(source)) {
        violations.push(path.basename(filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it('requires non-structural adapters touching context input/config to use authoritative helpers', () => {
    const violations: string[] = [];
    for (const filePath of adapterFiles) {
      const fileName = path.basename(filePath);
      if (structuralExceptions.has(fileName)) continue;

      const source = fs.readFileSync(filePath, 'utf8');
      const touchesExecutionInputs = /context\.(inputs|config)/.test(source);
      const usesAuthoritativeHelper = /getAuthoritativeInputs|mergeAuthoritativeInputs/.test(source);
      if (touchesExecutionInputs && !usesAuthoritativeHelper) {
        violations.push(fileName);
      }
    }

    expect(violations).toEqual([]);
  });
});
