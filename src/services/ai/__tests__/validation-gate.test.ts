/**
 * Unit tests for Template Validation Gate
 * Tests confidence thresholds and validation logic
 */

import { validateMapping, validateMappings, getConfidenceThreshold } from '../template-validation-gate';
import { TemplateMapping } from '../schema-aware-template-generator';
import { NodeOutputFields } from '../input-field-mapper';

describe('Template Validation Gate', () => {
  const createMockUpstreamSchema = (fields: string[]): NodeOutputFields => ({
    nodeId: 'upstream-node',
    nodeType: 'http_request',
    outputFields: fields,
    outputSchema: {
      structure: {
        fields: fields.reduce((acc, f) => {
          acc[f] = 'string';
          return acc;
        }, {} as Record<string, string>),
      },
    },
    commonFields: ['data', 'output'],
  });

  describe('Confidence Thresholds', () => {
    it('should return correct threshold values', () => {
      expect(getConfidenceThreshold('HIGH')).toBe(0.8);
      expect(getConfidenceThreshold('MEDIUM')).toBe(0.6);
      expect(getConfidenceThreshold('LOW')).toBe(0.4);
      expect(getConfidenceThreshold('MINIMUM')).toBe(0.3);
    });
  });

  describe('Single Mapping Validation', () => {
    it('should approve high confidence mappings', () => {
      const upstreamSchema = createMockUpstreamSchema(['body', 'status']);
      const mapping: TemplateMapping = {
        targetField: 'body',
        sourceField: 'body',
        template: '{{$json.body}}',
        confidence: 0.95,
        reason: 'exact match',
      };

      const result = validateMapping(mapping, upstreamSchema, 'google_gmail');

      expect(result.ok).toBe(true);
      expect(result.score).toBeGreaterThan(0.8);
      expect(result.reasons.length).toBe(0);
    });

    it('should reject mappings with invalid source field', () => {
      const upstreamSchema = createMockUpstreamSchema(['status', 'headers']);
      const mapping: TemplateMapping = {
        targetField: 'body',
        sourceField: 'body', // Doesn't exist in upstream
        template: '{{$json.body}}',
        confidence: 0.9,
        reason: 'exact match',
      };

      const result = validateMapping(mapping, upstreamSchema, 'google_gmail');

      expect(result.ok).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons[0]).toContain('not found in upstream schema');
    });

    it('should reject low confidence mappings', () => {
      const upstreamSchema = createMockUpstreamSchema(['body']);
      const mapping: TemplateMapping = {
        targetField: 'body',
        sourceField: 'body',
        template: '{{$json.body}}',
        confidence: 0.2, // Below minimum threshold
        reason: 'uncertain match',
      };

      const result = validateMapping(mapping, upstreamSchema, 'google_gmail');

      expect(result.ok).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should penalize mappings marked as needsReview', () => {
      const upstreamSchema = createMockUpstreamSchema(['body']);
      const mapping: TemplateMapping = {
        targetField: 'body',
        sourceField: 'body',
        template: '{{$json.body}}',
        confidence: 0.8,
        reason: 'uncertain match',
        needsReview: true,
      };

      const result = validateMapping(mapping, upstreamSchema, 'google_gmail');

      expect(result.score).toBeLessThan(0.8); // Penalized
    });
  });

  describe('Multiple Mappings Validation', () => {
    it('should approve all mappings when all are valid', () => {
      const upstreamSchema = createMockUpstreamSchema(['body', 'subject', 'to']);
      const mappings: TemplateMapping[] = [
        {
          targetField: 'body',
          sourceField: 'body',
          template: '{{$json.body}}',
          confidence: 0.95,
          reason: 'exact match',
        },
        {
          targetField: 'subject',
          sourceField: 'subject',
          template: '{{$json.subject}}',
          confidence: 0.9,
          reason: 'exact match',
        },
      ];

      const result = validateMappings(mappings, upstreamSchema, 'google_gmail');

      expect(result.ok).toBe(true);
      expect(result.score).toBeGreaterThan(0.8);
      expect(result.approvedMappings.length).toBe(2);
      expect(result.rejectedMappings.length).toBe(0);
    });

    it('should reject invalid mappings', () => {
      const upstreamSchema = createMockUpstreamSchema(['status']);
      const mappings: TemplateMapping[] = [
        {
          targetField: 'body',
          sourceField: 'body', // Doesn't exist
          template: '{{$json.body}}',
          confidence: 0.9,
          reason: 'exact match',
        },
      ];

      const result = validateMappings(mappings, upstreamSchema, 'google_gmail');

      expect(result.ok).toBe(false);
      expect(result.approvedMappings.length).toBe(0);
      expect(result.rejectedMappings.length).toBe(1);
    });

    it('should provide warnings for medium-confidence rejections', () => {
      const upstreamSchema = createMockUpstreamSchema(['body']);
      const mappings: TemplateMapping[] = [
        {
          targetField: 'body',
          sourceField: 'body',
          template: '{{$json.body}}',
          confidence: 0.5, // Medium confidence
          reason: 'uncertain match',
        },
      ];

      const result = validateMappings(mappings, upstreamSchema, 'google_gmail');

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('medium confidence');
    });
  });
});
