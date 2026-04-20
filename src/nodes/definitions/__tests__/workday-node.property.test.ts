/**
 * Property-Based Tests: Workday Node Integration
 * Feature: workday-node-integration
 *
 * All properties use fast-check with a minimum of 100 iterations.
 * Each test is tagged with the property number from the design document.
 */

import * as fc from 'fast-check';
import { workdayNodeDefinition } from '../workday-node';

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_RESOURCES = ['workers', 'jobs', 'organizations', 'supervisoryOrganizations', 'positions'] as const;
const VALID_OPERATIONS = ['get_many', 'get_by_id', 'create', 'update'] as const;

// ─── Property 1: Invalid resource values are always rejected ─────────────────
// Feature: workday-node-integration, Property 1: Invalid resource values are always rejected
// Validates: Requirements 2.8, 3.5

test('Property 1: Invalid resource values are always rejected', () => {
  fc.assert(
    fc.property(
      fc.string().filter((s) => !(VALID_RESOURCES as readonly string[]).includes(s)),
      (invalidResource) => {
        const result = workdayNodeDefinition.validateInputs({
          resource: invalidResource,
          operation: 'get_many',
          authType: 'oauth2',
          accessToken: 'tok',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 2: Invalid operation values are always rejected ─────────────────
// Feature: workday-node-integration, Property 2: Invalid operation values are always rejected
// Validates: Requirements 2.9, 3.6

test('Property 2: Invalid operation values are always rejected', () => {
  fc.assert(
    fc.property(
      fc.string().filter((s) => !(VALID_OPERATIONS as readonly string[]).includes(s)),
      (invalidOperation) => {
        const result = workdayNodeDefinition.validateInputs({
          resource: 'workers',
          operation: invalidOperation,
          authType: 'oauth2',
          accessToken: 'tok',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    ),
    { numRuns: 100 }
  );
});

// ─── Property 3: Valid resource/operation combinations always pass validation ──
// Feature: workday-node-integration, Property 3: Valid resource/operation combinations always pass validation
// Validates: Requirements 2.10

test('Property 3: Valid resource/operation combinations always pass validation', () => {
  // Build the full 20-combination cross-product
  const combinations = VALID_RESOURCES.flatMap((resource) =>
    VALID_OPERATIONS.map((operation) => ({ resource, operation }))
  );

  fc.assert(
    fc.property(
      fc.constantFrom(...combinations),
      ({ resource, operation }) => {
        // For get_by_id and update, a non-empty recordId is required.
        // For create and update, a non-null payload is required.
        const needsRecordId = operation === 'get_by_id' || operation === 'update';
        const needsPayload = operation === 'create' || operation === 'update';

        const result = workdayNodeDefinition.validateInputs({
          resource,
          operation,
          authType: 'oauth2',
          accessToken: 'tok',
          ...(needsRecordId ? { recordId: 'rec-123' } : {}),
          ...(needsPayload ? { payload: { key: 'value' } } : {}),
        });

        expect(result.valid).toBe(true);
      }
    ),
    { numRuns: 100 }
  );
});
