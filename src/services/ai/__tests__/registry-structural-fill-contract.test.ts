import { buildRegistryStructuralFillContractSection } from '../registry-structural-fill-contract';

describe('registry-structural-fill-contract', () => {
  it('emits registry-backed buckets for known node types', () => {
    const s = buildRegistryStructuralFillContractSection(['log_output', 'form']);
    expect(s).toContain('Configuration contract');
    expect(s).toContain('`form`');
    expect(s).toContain('`log_output`');
    expect(s).toMatch(/buildtime_ai_once|runtime_ai|manual_static/);
  });

  it('deduplicates node types by first occurrence order', () => {
    const s = buildRegistryStructuralFillContractSection(['form', 'form']);
    const first = s.indexOf('### ');
    const second = s.indexOf('### ', first + 1);
    expect(second).toBe(-1);
  });
});
