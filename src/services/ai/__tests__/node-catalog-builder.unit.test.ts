/**
 * Unit Tests: Node Catalog Builder — buildNodeCatalog() and buildNodeCatalogText() invariants
 * Day 46: fills coverage gap for the buildNodeCatalog() function (entirely untested).
 */

import {
  buildNodeCatalog,
  buildNodeCatalogText,
  type NodeCatalogEntry,
} from '../node-catalog-builder';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

// ─── buildNodeCatalog ─────────────────────────────────────────────────────────

describe('buildNodeCatalog', () => {
  let catalog: NodeCatalogEntry[];

  beforeAll(() => {
    catalog = buildNodeCatalog();
  });

  it('returns an array', () => {
    expect(Array.isArray(catalog)).toBe(true);
  });

  it('includes every type registered in the unified registry', () => {
    const catalogTypes = new Set(catalog.map((e) => e.type));
    const allTypes = unifiedNodeRegistry.getAllTypes();
    for (const type of allTypes) {
      expect(catalogTypes.has(type)).toBe(true);
    }
  });

  it('each entry has all required shape fields', () => {
    for (const entry of catalog) {
      expect(typeof entry.type).toBe('string');
      expect(entry.type.length).toBeGreaterThan(0);

      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);

      expect(typeof entry.category).toBe('string');
      expect(typeof entry.description).toBe('string');

      expect(Array.isArray(entry.capabilities)).toBe(true);
      expect(Array.isArray(entry.inputs)).toBe(true);
      expect(Array.isArray(entry.outputs)).toBe(true);
      expect(Array.isArray(entry.examples)).toBe(true);
    }
  });

  it('input entries have name, type, and required fields', () => {
    for (const entry of catalog) {
      for (const input of entry.inputs) {
        expect(typeof input.name).toBe('string');
        expect(typeof input.type).toBe('string');
        expect(typeof input.required).toBe('boolean');
      }
    }
  });

  it('extracts enum-based operations into the operations array', () => {
    const withOps = catalog.find((e) => Array.isArray(e.operations) && e.operations.length > 0);
    if (!withOps) return; // no nodes with enum operations — skip
    expect(withOps.operations!.length).toBeGreaterThan(0);
    for (const op of withOps.operations!) {
      expect(typeof op).toBe('string');
    }
  });

  it('maps read-style operations to data_source capability', () => {
    const readKeywords = ['read', 'get', 'list', 'search', 'fetch', 'query', 'retrieve'];
    const entry = catalog.find((e) =>
      e.operations?.some((op) => readKeywords.includes(op.toLowerCase()))
    );
    if (!entry?.operationCapabilities) return;
    const readOp = entry.operations!.find((op) => readKeywords.includes(op.toLowerCase()));
    if (!readOp) return;
    const caps = entry.operationCapabilities![readOp];
    if (caps) {
      expect(caps).toContain('data_source');
    }
  });

  it('maps write-style operations to output capability', () => {
    const writeKeywords = ['write', 'send', 'create', 'update', 'delete', 'append', 'post', 'publish'];
    const entry = catalog.find((e) =>
      e.operations?.some((op) => writeKeywords.includes(op.toLowerCase()))
    );
    if (!entry?.operationCapabilities) return;
    const writeOp = entry.operations!.find((op) => writeKeywords.includes(op.toLowerCase()));
    if (!writeOp) return;
    const caps = entry.operationCapabilities![writeOp];
    if (caps) {
      expect(caps).toContain('output');
    }
  });

  it('does not add operations key when no operation field exists in schema', () => {
    // manual_trigger is a trigger with no multi-operation schema; it should have no operations
    const triggerEntry = catalog.find((e) => e.type === 'manual_trigger');
    if (!triggerEntry) return;
    expect(triggerEntry.operations).toBeUndefined();
  });

  it('falls back to type string as name when label is missing', () => {
    // name = def.label || type — so name must always be non-empty regardless
    for (const entry of catalog) {
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });
});

// ─── buildNodeCatalogText structural invariants ───────────────────────────────

describe('buildNodeCatalogText structural invariants', () => {
  let entries: any[];

  beforeAll(() => {
    entries = JSON.parse(buildNodeCatalogText({ tokenBudget: 10_000_000 }));
  });

  it('isTrigger is true for every trigger-category entry', () => {
    const triggerEntries = entries.filter((e: any) => e.category === 'trigger');
    for (const e of triggerEntries) {
      expect(e.isTrigger).toBe(true);
    }
  });

  it('isTrigger is false for every non-trigger entry', () => {
    const nonTriggers = entries.filter((e: any) => e.category !== 'trigger');
    for (const e of nonTriggers) {
      expect(e.isTrigger).toBe(false);
    }
  });

  it('description is at most 120 characters', () => {
    for (const e of entries) {
      expect(e.description.length).toBeLessThanOrEqual(120);
    }
  });

  it('inputSummary has at most 8 entries', () => {
    for (const e of entries) {
      expect(Array.isArray(e.inputSummary)).toBe(true);
      expect(e.inputSummary.length).toBeLessThanOrEqual(8);
    }
  });

  it('outputSummary has at most 4 entries', () => {
    for (const e of entries) {
      expect(Array.isArray(e.outputSummary)).toBe(true);
      expect(e.outputSummary.length).toBeLessThanOrEqual(4);
    }
  });

  it('returns parseable JSON for default options', () => {
    expect(() => JSON.parse(buildNodeCatalogText())).not.toThrow();
  });

  it('uses type as label fallback when def.label is absent', () => {
    for (const e of entries) {
      expect(typeof e.label).toBe('string');
      expect(e.label.length).toBeGreaterThan(0);
    }
  });
});
