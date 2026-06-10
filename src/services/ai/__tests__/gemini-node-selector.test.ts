/**
 * Unit Tests: gemini-node-selector
 * Day 196: covers selectNodesFromIntent and buildTagsFromRegistry
 */

jest.mock('../node-metadata-enricher', () => ({
  nodeMetadataEnricher: {
    enrichAllNodes: jest.fn(),
    formatRegistryForNodeSelection: jest.fn(),
  },
}));

jest.mock('../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

jest.mock('../../../core/registry/unified-node-registry', () => ({
  unifiedNodeRegistry: {
    get: jest.fn(),
  },
}));

import { selectNodesFromIntent, buildTagsFromRegistry } from '../gemini-node-selector';
import { nodeMetadataEnricher } from '../node-metadata-enricher';
import { geminiOrchestrator } from '../gemini-orchestrator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

const mockEnrichAllNodes = nodeMetadataEnricher.enrichAllNodes as jest.Mock;
const mockFormatRegistry = nodeMetadataEnricher.formatRegistryForNodeSelection as jest.Mock;
const mockProcessRequest = geminiOrchestrator.processRequest as jest.Mock;
const mockRegistryGet = unifiedNodeRegistry.get as jest.Mock;

// ─── buildTagsFromRegistry ────────────────────────────────────────────────────

describe('buildTagsFromRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns "type:category" for nodes that have a category in the registry', () => {
    mockRegistryGet.mockImplementation((type: string) => {
      if (type === 'google_gmail') return { category: 'communication' };
      if (type === 'if_else') return { category: 'logic' };
      return null;
    });
    expect(buildTagsFromRegistry(['google_gmail', 'if_else'])).toEqual([
      'google_gmail:communication',
      'if_else:logic',
    ]);
  });

  it('returns the type string verbatim when the registry returns null', () => {
    mockRegistryGet.mockReturnValue(null);
    expect(buildTagsFromRegistry(['unknown_node'])).toEqual(['unknown_node']);
  });

  it('returns the type string verbatim when the registry entry has no category field', () => {
    mockRegistryGet.mockReturnValue({});
    expect(buildTagsFromRegistry(['nodetype_no_cat'])).toEqual(['nodetype_no_cat']);
  });

  it('returns empty array for empty input without calling registry', () => {
    expect(buildTagsFromRegistry([])).toEqual([]);
    expect(mockRegistryGet).not.toHaveBeenCalled();
  });

  it('handles mixed known and unknown types correctly', () => {
    mockRegistryGet.mockImplementation((type: string) =>
      type === 'slack_message' ? { category: 'communication' } : null
    );
    expect(buildTagsFromRegistry(['slack_message', 'no_such_node'])).toEqual([
      'slack_message:communication',
      'no_such_node',
    ]);
  });
});

// ─── selectNodesFromIntent ────────────────────────────────────────────────────

describe('selectNodesFromIntent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnrichAllNodes.mockReturnValue([]);
    mockFormatRegistry.mockReturnValue(
      'Available node types:\n\nmanual_trigger | trigger | starts a flow'
    );
  });

  it('returns filtered nodeTypes from a well-formed Gemini response', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ nodeTypes: ['manual_trigger', 'google_gmail'] })
    );
    mockRegistryGet.mockImplementation((t: string) =>
      t === 'manual_trigger' || t === 'google_gmail' ? { category: 'trigger' } : null
    );

    const result = await selectNodesFromIntent('send an email on trigger');
    expect(result.nodeTypes).toEqual(['manual_trigger', 'google_gmail']);
  });

  it('filters out node types not present in the registry', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ nodeTypes: ['manual_trigger', 'nonexistent_node'] })
    );
    mockRegistryGet.mockImplementation((t: string) =>
      t === 'manual_trigger' ? { category: 'trigger' } : null
    );

    const result = await selectNodesFromIntent('trigger something');
    expect(result.nodeTypes).toEqual(['manual_trigger']);
    expect(result.nodeTypes).not.toContain('nonexistent_node');
  });

  it('strips markdown code fences from Gemini response before parsing', async () => {
    mockProcessRequest.mockResolvedValue('```json\n{"nodeTypes":["manual_trigger"]}\n```');
    mockRegistryGet.mockReturnValue({ category: 'trigger' });

    const result = await selectNodesFromIntent('some prompt');
    expect(result.nodeTypes).toEqual(['manual_trigger']);
  });

  it('returns tags array from Gemini when the tags field is present', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ nodeTypes: ['manual_trigger'], tags: ['manual_trigger:trigger'] })
    );
    mockRegistryGet.mockReturnValue({ category: 'trigger' });

    const result = await selectNodesFromIntent('prompt with tags');
    expect(result.tags).toEqual(['manual_trigger:trigger']);
  });

  it('returns undefined tags when Gemini omits the tags field', async () => {
    mockProcessRequest.mockResolvedValue(JSON.stringify({ nodeTypes: ['manual_trigger'] }));
    mockRegistryGet.mockReturnValue({ category: 'trigger' });

    const result = await selectNodesFromIntent('no tags prompt');
    expect(result.tags).toBeUndefined();
  });

  it('returns empty nodeTypes when Gemini returns nodeTypes as a non-array', async () => {
    mockProcessRequest.mockResolvedValue(JSON.stringify({ nodeTypes: 'not-an-array' }));

    const result = await selectNodesFromIntent('bad response');
    expect(result.nodeTypes).toEqual([]);
  });

  it('returns empty nodeTypes and no error when processRequest throws', async () => {
    mockProcessRequest.mockRejectedValue(new Error('LLM error'));

    const result = await selectNodesFromIntent('failing prompt');
    expect(result.nodeTypes).toEqual([]);
    expect(result.tags).toBeUndefined();
  });

  it('returns empty nodeTypes when the response is not valid JSON', async () => {
    mockProcessRequest.mockResolvedValue('this is not json at all');

    const result = await selectNodesFromIntent('invalid json');
    expect(result.nodeTypes).toEqual([]);
  });

  it('trims whitespace from node type strings before registry lookup', async () => {
    mockProcessRequest.mockResolvedValue(
      JSON.stringify({ nodeTypes: ['  manual_trigger  ', ' google_gmail '] })
    );
    mockRegistryGet.mockImplementation((t: string) =>
      t === 'manual_trigger' || t === 'google_gmail' ? { category: 'action' } : null
    );

    const result = await selectNodesFromIntent('whitespace test');
    expect(result.nodeTypes).toContain('manual_trigger');
    expect(result.nodeTypes).toContain('google_gmail');
  });

  it('calls processRequest with node-suggestion type, cache:false, and temperature:0.2', async () => {
    mockProcessRequest.mockResolvedValue(JSON.stringify({ nodeTypes: [] }));

    await selectNodesFromIntent('test prompt');

    expect(mockProcessRequest).toHaveBeenCalledWith(
      'node-suggestion',
      expect.objectContaining({ message: expect.stringContaining('test prompt') }),
      expect.objectContaining({ cache: false, temperature: 0.2 })
    );
  });

  it('handles object response with a .content field containing JSON', async () => {
    mockProcessRequest.mockResolvedValue({
      content: JSON.stringify({ nodeTypes: ['manual_trigger'] }),
    });
    mockRegistryGet.mockReturnValue({ category: 'trigger' });

    const result = await selectNodesFromIntent('object with content field');
    expect(result.nodeTypes).toEqual(['manual_trigger']);
  });

  it('handles object response with a .text field containing JSON', async () => {
    mockProcessRequest.mockResolvedValue({
      text: JSON.stringify({ nodeTypes: ['if_else'] }),
    });
    mockRegistryGet.mockReturnValue({ category: 'logic' });

    const result = await selectNodesFromIntent('object with text field');
    expect(result.nodeTypes).toEqual(['if_else']);
  });
});
