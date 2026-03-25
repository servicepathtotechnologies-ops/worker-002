import { snapshotConfigFieldToString } from '../comprehensive-node-questions-generator';

describe('snapshotConfigFieldToString', () => {
  it('stringifies objects for wizard defaults', () => {
    const out = snapshotConfigFieldToString({ a: 1, b: 'x' });
    expect(out).toContain('"a"');
    expect(out).toContain('1');
  });

  it('passes through strings', () => {
    expect(snapshotConfigFieldToString('hello')).toBe('hello');
  });
});
