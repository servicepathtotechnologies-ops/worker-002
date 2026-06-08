import { isTriggerNodeType, isInternalNodeType, isOutputSinkNodeType } from '../node-role';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';

jest.mock('../../registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    isTrigger: jest.fn(),
    get: jest.fn(),
  },
}));

const mockIsTrigger = unifiedNodeRegistry.isTrigger as jest.Mock;
const mockGet = unifiedNodeRegistry.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isTriggerNodeType', () => {
  it('returns true when registry says trigger', () => {
    mockIsTrigger.mockReturnValue(true);
    expect(isTriggerNodeType('webhook_trigger')).toBe(true);
    expect(mockIsTrigger).toHaveBeenCalledWith('webhook_trigger');
  });

  it('returns false when registry says not trigger', () => {
    mockIsTrigger.mockReturnValue(false);
    expect(isTriggerNodeType('send_email')).toBe(false);
  });
});

describe('isInternalNodeType', () => {
  it('returns true when def tags include internal', () => {
    mockGet.mockReturnValue({ tags: ['internal', 'system'] });
    expect(isInternalNodeType('noop')).toBe(true);
  });

  it('returns false when def tags do not include internal', () => {
    mockGet.mockReturnValue({ tags: ['action', 'http'] });
    expect(isInternalNodeType('http_request')).toBe(false);
  });

  it('returns false when def is undefined (unknown node type)', () => {
    mockGet.mockReturnValue(undefined);
    expect(isInternalNodeType('nonexistent_node')).toBe(false);
  });

  it('returns false when tags is empty array', () => {
    mockGet.mockReturnValue({ tags: [] });
    expect(isInternalNodeType('some_node')).toBe(false);
  });

  it('returns false when def has no tags property', () => {
    mockGet.mockReturnValue({ category: 'action' });
    expect(isInternalNodeType('some_node')).toBe(false);
  });
});

describe('isOutputSinkNodeType', () => {
  it('returns true when category is communication', () => {
    mockGet.mockReturnValue({ category: 'communication', tags: [] });
    expect(isOutputSinkNodeType('send_email')).toBe(true);
  });

  it('returns true when category is output', () => {
    mockGet.mockReturnValue({ category: 'output', tags: [] });
    expect(isOutputSinkNodeType('file_write')).toBe(true);
  });

  it('returns true when tags include sink', () => {
    mockGet.mockReturnValue({ category: 'action', tags: ['sink'] });
    expect(isOutputSinkNodeType('custom_sink')).toBe(true);
  });

  it('returns true when tags include output', () => {
    mockGet.mockReturnValue({ category: 'action', tags: ['output', 'custom'] });
    expect(isOutputSinkNodeType('custom_output')).toBe(true);
  });

  it('returns false when def is undefined', () => {
    mockGet.mockReturnValue(undefined);
    expect(isOutputSinkNodeType('unknown_node')).toBe(false);
  });

  it('returns false when category and tags do not match', () => {
    mockGet.mockReturnValue({ category: 'trigger', tags: ['event'] });
    expect(isOutputSinkNodeType('my_trigger')).toBe(false);
  });

  it('returns false when def has no tags and non-sink category', () => {
    mockGet.mockReturnValue({ category: 'transform' });
    expect(isOutputSinkNodeType('transform_node')).toBe(false);
  });
});
