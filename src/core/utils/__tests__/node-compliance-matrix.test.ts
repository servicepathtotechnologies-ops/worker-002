import { describe, expect, it } from '@jest/globals';
import { buildNodeComplianceMatrix, complianceMatrixToCsv } from '../node-compliance-matrix';

describe('node-compliance-matrix', () => {
  it('builds matrix with nodes and field rows', () => {
    const m = buildNodeComplianceMatrix();
    expect(m.nodeCount).toBeGreaterThan(50);
    expect(m.fieldRowCount).toBeGreaterThan(100);
    expect(m.overrideTypeCount).toBeGreaterThan(0);
    expect(m.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes google_gmail subject with title_like and registry_override', () => {
    const m = buildNodeComplianceMatrix();
    const subject = m.fields.find((r) => r.nodeType === 'google_gmail' && r.fieldName === 'subject');
    expect(subject).toBeDefined();
    expect(subject!.role).toBe('title_like');
    expect(subject!.fillModeDefault).toBe('runtime_ai');
    expect(subject!.essentialForExecution).toBe(true);
    expect(subject!.executeImplementation).toBe('registry_override');
  });

  it('emits valid CSV with header', () => {
    const m = buildNodeComplianceMatrix();
    const csv = complianceMatrixToCsv(m);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(m.fieldRowCount + 1);
    expect(lines[0]).toContain('nodeType');
    expect(lines[0]).toContain('fillModeDefault');
    expect(lines[0]).toContain('executeImplementation');
  });
});
