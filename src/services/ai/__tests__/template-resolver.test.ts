/**
 * Unit Tests: template-resolver
 * Day 198: covers TemplateResolver.resolveNodeTemplates and all private helpers
 */

jest.mock('../transformation-templates', () => ({
  isTransformationNode: jest.fn(),
  getTransformationTemplate: jest.fn(),
  TransformationProperties: undefined,
}));

import { TemplateResolver, templateResolver } from '../template-resolver';
import { isTransformationNode, getTransformationTemplate } from '../transformation-templates';
import type { WorkflowNode, Requirements } from '../../../core/types/ai-types';

const mockIsTransformationNode = isTransformationNode as jest.Mock;
const mockGetTemplate = getTransformationTemplate as jest.Mock;

function makeNode(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return {
    id,
    type,
    data: { label: id, type, category: 'test', config },
  };
}

const minimalRequirements: Requirements = {
  primaryGoal: 'test',
  keySteps: [],
  inputs: [],
  outputs: [],
  constraints: [],
  complexity: 'simple',
};

describe('TemplateResolver', () => {
  let resolver: TemplateResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsTransformationNode.mockReturnValue(false);
    mockGetTemplate.mockReturnValue({});
    resolver = new TemplateResolver();
  });

  describe('resolveNodeTemplates', () => {
    it('returns non-transformation nodes unchanged', () => {
      const node = makeNode('n1', 'send_email');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(node);
    });

    it('returns empty array for empty input', () => {
      expect(resolver.resolveNodeTemplates([], minimalRequirements)).toEqual([]);
    });

    it('processes transformation nodes through resolveTransformationNode', () => {
      mockIsTransformationNode.mockImplementation((t: string) => t === 'filter_data');
      mockGetTemplate.mockReturnValue({ filterType: 'strict' });
      const node = makeNode('n1', 'filter_data');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect(result[0].data.config).toMatchObject({ filterType: 'strict' });
    });

    it('preserves original node identity for non-transformation nodes in mixed array', () => {
      const regular = makeNode('n1', 'http_request');
      mockIsTransformationNode.mockImplementation((t: string) => t === 'filter_data');
      mockGetTemplate.mockReturnValue({});
      const transform = makeNode('n2', 'filter_data');
      const result = resolver.resolveNodeTemplates([regular, transform], minimalRequirements);
      expect(result[0]).toBe(regular);
      expect(result[1]).not.toBe(transform);
    });
  });

  describe('resolveTransformationNode — input fields from inputOutputMappings', () => {
    it('sets inputFields from matching mapping when targetNodeId matches', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n2', 'transform');
      const reqs: Requirements = {
        ...minimalRequirements,
        inputOutputMappings: [
          { sourceNodeId: 'n1', targetNodeId: 'n2', fieldMappings: { email: 'user_email', name: 'user_name' } },
        ],
      };
      const result = resolver.resolveNodeTemplates([node], reqs);
      expect(result[0].data.config.inputFields).toEqual(['email', 'name']);
    });

    it('leaves inputFields unset when mappings present but targetNodeId does not match', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n2', 'transform');
      const reqs: Requirements = {
        ...minimalRequirements,
        inputOutputMappings: [
          { sourceNodeId: 'n1', targetNodeId: 'n99', fieldMappings: { email: 'x' } },
        ],
      };
      const result = resolver.resolveNodeTemplates([node], reqs);
      // mapping branch runs but finds no match → inputFields stays unset
      expect(result[0].data.config.inputFields).toBeUndefined();
    });
  });

  describe('resolveTransformationNode — generateInputFieldsFromPrevious', () => {
    it('uses previous node outputFields array when available', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const prev = makeNode('n1', 'some_node', { outputFields: ['foo', 'bar'] });
      const curr = makeNode('n2', 'transform');
      const result = resolver.resolveNodeTemplates([prev, curr], minimalRequirements);
      expect(result[1].data.config.inputFields).toEqual(['foo', 'bar']);
    });

    it('wraps single string outputFields from previous node', () => {
      mockIsTransformationNode.mockImplementation((t: string) => t === 'transform');
      mockGetTemplate.mockReturnValue({});
      const prev = makeNode('n1', 'some_node', { outputFields: 'result' });
      const curr = makeNode('n2', 'transform');
      const result = resolver.resolveNodeTemplates([prev, curr], minimalRequirements);
      expect(result[1].data.config.inputFields).toEqual(['result']);
    });

    it('infers http fields from previous node type containing "http"', () => {
      mockIsTransformationNode.mockImplementation((t: string) => t === 'transform');
      mockGetTemplate.mockReturnValue({});
      const prev = makeNode('n1', 'http_request');
      const curr = makeNode('n2', 'transform');
      const result = resolver.resolveNodeTemplates([prev, curr], minimalRequirements);
      expect(result[1].data.config.inputFields).toEqual(['response', 'data', 'body']);
    });

    it('infers sheet fields from previous node type containing "sheet"', () => {
      mockIsTransformationNode.mockImplementation((t: string) => t === 'transform');
      mockGetTemplate.mockReturnValue({});
      const prev = makeNode('n1', 'google_sheet');
      const curr = makeNode('n2', 'transform');
      const result = resolver.resolveNodeTemplates([prev, curr], minimalRequirements);
      expect(result[1].data.config.inputFields).toEqual(['rows', 'data', 'records']);
    });

    it('infers json fields from previous node type containing "json"', () => {
      mockIsTransformationNode.mockImplementation((t: string) => t === 'transform');
      mockGetTemplate.mockReturnValue({});
      const prev = makeNode('n1', 'json_parser');
      const curr = makeNode('n2', 'transform');
      const result = resolver.resolveNodeTemplates([prev, curr], minimalRequirements);
      expect(result[1].data.config.inputFields).toEqual(['json', 'data', 'parsed']);
    });

    it('falls back to default fields when previous node type is unrecognized', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const prev = makeNode('n1', 'email_node');
      const curr = makeNode('n2', 'transform');
      const result = resolver.resolveNodeTemplates([prev, curr], minimalRequirements);
      expect(result[1].data.config.inputFields).toEqual(['data', 'output', 'result']);
    });

    it('leaves inputFields unset when node is first in list (no previous, no mappings)', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'transform');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      // no previousNode and no inputOutputMappings → neither branch runs
      expect(result[0].data.config.inputFields).toBeUndefined();
    });
  });

  describe('resolveTransformationNode — generateTransformationLogic', () => {
    it('applies format_conversion logic', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'transform');
      const reqs: Requirements = {
        ...minimalRequirements,
        dataTransformations: [{ type: 'format_conversion', sourceFormat: 'xml', targetFormat: 'json' }],
      };
      const result = resolver.resolveNodeTemplates([node], reqs);
      expect(result[0].data.config.sourceFormat).toBe('xml');
      expect(result[0].data.config.targetFormat).toBe('json');
    });

    it('uses default formats when format_conversion has no source/target', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'transform');
      const reqs: Requirements = {
        ...minimalRequirements,
        dataTransformations: [{ type: 'format_conversion' }],
      };
      const result = resolver.resolveNodeTemplates([node], reqs);
      expect(result[0].data.config.sourceFormat).toBe('json');
      expect(result[0].data.config.targetFormat).toBe('csv');
    });

    it('applies filtering logic', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'transform');
      const reqs: Requirements = {
        ...minimalRequirements,
        dataTransformations: [{ type: 'filtering', criteria: [{ field: 'age', gt: 18 }], operator: 'OR' }],
      };
      const result = resolver.resolveNodeTemplates([node], reqs);
      expect(result[0].data.config.filterConditions).toEqual([{ field: 'age', gt: 18 }]);
      expect(result[0].data.config.logicalOperator).toBe('OR');
    });

    it('applies aggregation logic', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'transform');
      const reqs: Requirements = {
        ...minimalRequirements,
        dataTransformations: [{ type: 'aggregation', operations: ['count', 'avg'] }],
      };
      const result = resolver.resolveNodeTemplates([node], reqs);
      expect(result[0].data.config.aggregationType).toBe('sum');
      expect(result[0].data.config.operations).toEqual(['count', 'avg']);
    });
  });

  describe('resolveTransformationNode — determineRequiredFields', () => {
    it('includes filter-specific required fields for filter node type', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'data_filter');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      const required = result[0].data.config.requiredFields as string[];
      expect(required).toContain('filterConditions');
      expect(required).toContain('logicalOperator');
      expect(required).toContain('inputFields');
      expect(required).toContain('outputFields');
    });

    it('includes format-specific required fields for format node type', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'format_converter');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      const required = result[0].data.config.requiredFields as string[];
      expect(required).toContain('sourceFormat');
      expect(required).toContain('targetFormat');
    });

    it('includes aggregate-specific required fields for aggregate node type', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'data_aggregate');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      const required = result[0].data.config.requiredFields as string[];
      expect(required).toContain('aggregationType');
      expect(required).toContain('operations');
    });

    it('always includes inputFields and outputFields for any transform type', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'custom_transform');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      const required = result[0].data.config.requiredFields as string[];
      expect(required).toContain('inputFields');
      expect(required).toContain('outputFields');
    });

    it('does not overwrite pre-existing requiredFields from template', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'transform', { requiredFields: ['x', 'y'] });
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect(result[0].data.config.requiredFields).toEqual(['x', 'y']);
    });
  });

  describe('resolveTransformationNode — generateOutputFieldNames', () => {
    it('prefixes previous node outputFields with "transformed_" (array)', () => {
      mockIsTransformationNode.mockImplementation((t: string) => t === 'transform');
      mockGetTemplate.mockReturnValue({});
      const prev = makeNode('n1', 'source', { outputFields: ['a', 'b'] });
      const curr = makeNode('n2', 'transform');
      const result = resolver.resolveNodeTemplates([prev, curr], minimalRequirements);
      expect(result[1].data.config.outputFields).toEqual(['transformed_a', 'transformed_b']);
    });

    it('prefixes previous node outputFields (string) with "transformed_"', () => {
      mockIsTransformationNode.mockImplementation((t: string) => t === 'transform');
      mockGetTemplate.mockReturnValue({});
      const prev = makeNode('n1', 'source', { outputFields: 'value' });
      const curr = makeNode('n2', 'transform');
      const result = resolver.resolveNodeTemplates([prev, curr], minimalRequirements);
      expect(result[1].data.config.outputFields).toEqual(['transformed_value']);
    });

    it('returns ["filtered_data"] for filter node type with no previous outputFields', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'filter_rows');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect(result[0].data.config.outputFields).toEqual(['filtered_data']);
    });

    it('returns ["formatted_data"] for format node type', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'format_data');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect(result[0].data.config.outputFields).toEqual(['formatted_data']);
    });

    it('returns ["aggregated_data", "summary"] for aggregate node type', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'aggregate_results');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect(result[0].data.config.outputFields).toEqual(['aggregated_data', 'summary']);
    });

    it('returns default ["transformed_data", "output"] for unknown type', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'custom_process');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect(result[0].data.config.outputFields).toEqual(['transformed_data', 'output']);
    });

    it('does not overwrite pre-existing non-empty outputFields', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({ outputFields: ['pre_existing'] });
      const node = makeNode('n1', 'transform');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect(result[0].data.config.outputFields).toEqual(['pre_existing']);
    });
  });

  describe('resolveTransformationNode — generateMappingRules', () => {
    it('creates direct mappings pairing inputs to outputs when lengths match', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({ outputFields: ['out1', 'out2'], inputFields: ['in1', 'in2'] });
      const node = makeNode('n1', 'transform');
      const reqs: Requirements = {
        ...minimalRequirements,
        inputOutputMappings: [
          { sourceNodeId: 'n0', targetNodeId: 'n1', fieldMappings: { in1: 'x', in2: 'y' } },
        ],
      };
      const result = resolver.resolveNodeTemplates([node], reqs);
      const rules = result[0].data.config.mappingRules as Array<{ source: string; target: string; transformation: string }>;
      expect(rules).toHaveLength(2);
      expect(rules[0]).toEqual({ source: '{{input.in1}}', target: 'out1', transformation: 'direct' });
      expect(rules[1]).toEqual({ source: '{{input.in2}}', target: 'out2', transformation: 'direct' });
    });

    it('maps extra output fields to first input when outputs > inputs', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({ outputFields: ['out1', 'out2', 'out3'], inputFields: ['in1'] });
      const node = makeNode('n1', 'transform');
      const reqs: Requirements = {
        ...minimalRequirements,
        inputOutputMappings: [
          { sourceNodeId: 'n0', targetNodeId: 'n1', fieldMappings: { in1: 'v' } },
        ],
      };
      const result = resolver.resolveNodeTemplates([node], reqs);
      const rules = result[0].data.config.mappingRules as Array<{ source: string }>;
      expect(rules).toHaveLength(3);
      expect(rules[2].source).toBe('{{input.in1}}');
    });

    it('falls back to "data" source when input fields array is empty', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({ outputFields: ['out1', 'out2'] });
      const node = makeNode('n1', 'transform');
      const result = resolver.resolveNodeTemplates([node], {
        ...minimalRequirements,
        inputOutputMappings: [{ sourceNodeId: 'n0', targetNodeId: 'n1', fieldMappings: {} }],
      });
      const rules = result[0].data.config.mappingRules as Array<{ source: string }>;
      expect(rules.every((r) => r.source === '{{input.data}}')).toBe(true);
    });
  });

  describe('resolveTransformationNode — errorHandling defaults', () => {
    it('sets default errorHandling when not present', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({});
      const node = makeNode('n1', 'transform');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect(result[0].data.config.errorHandling).toEqual({
        onError: 'continue',
        fallbackValue: null,
        logErrors: true,
      });
    });

    it('does not overwrite existing errorHandling', () => {
      mockIsTransformationNode.mockReturnValue(true);
      mockGetTemplate.mockReturnValue({ errorHandling: { onError: 'stop', logErrors: false } });
      const node = makeNode('n1', 'transform');
      const result = resolver.resolveNodeTemplates([node], minimalRequirements);
      expect((result[0].data.config.errorHandling as any).onError).toBe('stop');
    });
  });

  describe('exported singleton', () => {
    it('templateResolver is an instance of TemplateResolver', () => {
      expect(templateResolver).toBeInstanceOf(TemplateResolver);
    });
  });
});
