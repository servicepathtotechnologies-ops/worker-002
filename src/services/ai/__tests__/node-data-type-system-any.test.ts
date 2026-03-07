import { DataType, nodeDataTypeSystem } from '../node-data-type-system';

describe('NodeDataTypeSystem.checkTypeCompatibility', () => {
  test('treats source ANY as compatible with specific target unions (prevents trigger(any)->ai(text|array) failures)', () => {
    const res = nodeDataTypeSystem.checkTypeCompatibility(DataType.ANY, [DataType.TEXT, DataType.ARRAY]);
    expect(res.compatible).toBe(true);
    expect(res.requiresTransform).toBe(false);
  });
});

