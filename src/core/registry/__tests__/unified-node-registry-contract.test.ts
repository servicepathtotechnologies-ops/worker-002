/**
 * Day 33 — Unified Registry Contract Suite
 *
 * Protects the single source of node truth in unified-node-registry.ts.
 * Every registered node type must conform to the UnifiedNodeDefinition contract.
 *
 * Run:
 *   cd worker && npx jest src/core/registry/__tests__/unified-node-registry-contract.test.ts --runInBand
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { unifiedNodeRegistry } from '../unified-node-registry';
import { buildNodeCatalogText } from '../../../services/ai/node-catalog-builder';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const VALID_INPUT_FIELD_TYPES = ['string', 'number', 'boolean', 'array', 'object', 'json', 'expression'];

// ─── Per-node contract assertions ─────────────────────────────────────────────

describe('unified-node-registry — per-node contract', () => {
  const allTypes = unifiedNodeRegistry.getAllTypes();

  it('registry has at least one registered node type', () => {
    expect(allTypes.length).toBeGreaterThan(0);
  });

  for (const nodeType of allTypes) {
    describe(`node: ${nodeType}`, () => {
      const def = unifiedNodeRegistry.get(nodeType)!;

      // ── Identity ────────────────────────────────────────────────────────────
      it('definition exists', () => {
        expect(def).toBeDefined();
      });

      it('def.type matches registry key', () => {
        expect(def.type).toBe(nodeType);
      });

      it('has non-empty label', () => {
        expect(typeof def.label).toBe('string');
        expect(def.label.trim().length).toBeGreaterThan(0);
      });

      it('has non-empty category', () => {
        expect(typeof def.category).toBe('string');
        expect(def.category.trim().length).toBeGreaterThan(0);
      });

      it('has non-empty description', () => {
        expect(typeof def.description).toBe('string');
        expect(def.description.trim().length).toBeGreaterThan(0);
      });

      it('has version string', () => {
        expect(typeof def.version).toBe('string');
        expect(def.version.trim().length).toBeGreaterThan(0);
      });

      // ── Input schema ────────────────────────────────────────────────────────
      it('inputSchema is a non-null object', () => {
        expect(isPlainObject(def.inputSchema)).toBe(true);
      });

      it('every inputSchema field has a valid type property', () => {
        const badFields: string[] = [];
        for (const [fieldName, fieldDef] of Object.entries(def.inputSchema)) {
          if (!VALID_INPUT_FIELD_TYPES.includes((fieldDef as any).type)) {
            badFields.push(`${fieldName}:${(fieldDef as any).type}`);
          }
        }
        expect(badFields).toHaveLength(0);
      });

      it('requiredInputs is an array', () => {
        expect(Array.isArray(def.requiredInputs)).toBe(true);
      });

      it('every requiredInput key exists in inputSchema', () => {
        const inputKeys = new Set(Object.keys(def.inputSchema));
        const missing = def.requiredInputs.filter((k) => !inputKeys.has(k));
        expect(missing).toHaveLength(0);
      });

      // ── Output schema ───────────────────────────────────────────────────────
      it('outputSchema is a non-null object with at least one port', () => {
        expect(isPlainObject(def.outputSchema)).toBe(true);
        expect(Object.keys(def.outputSchema).length).toBeGreaterThanOrEqual(1);
      });

      it('each outputSchema port has a name and schema', () => {
        const badPorts: string[] = [];
        for (const [portKey, port] of Object.entries(def.outputSchema)) {
          if (typeof (port as any).name !== 'string') badPorts.push(`${portKey}:no-name`);
          else if (!isPlainObject((port as any).schema)) badPorts.push(`${portKey}:no-schema`);
        }
        expect(badPorts).toHaveLength(0);
      });

      // ── Credentials ─────────────────────────────────────────────────────────
      it('credentialSchema.requirements is an array if credentialSchema is present', () => {
        if (!def.credentialSchema) return;
        expect(Array.isArray(def.credentialSchema.requirements)).toBe(true);
      });

      it('each credential requirement has provider and category', () => {
        if (!def.credentialSchema) return;
        const bad: string[] = [];
        for (const req of def.credentialSchema.requirements) {
          if (!req.provider?.trim()) bad.push('missing provider');
          if (!req.category?.trim()) bad.push('missing category');
        }
        expect(bad).toHaveLength(0);
      });

      // ── Defaults & validation ───────────────────────────────────────────────
      it('defaultConfig() returns a plain object without throwing', () => {
        let config: Record<string, any> = {};
        expect(() => { config = def.defaultConfig(); }).not.toThrow();
        expect(isPlainObject(config)).toBe(true);
      });

      it('validateConfig(defaultConfig()) returns { valid, errors } without throwing', () => {
        const config = def.defaultConfig();
        let result: { valid: boolean; errors: string[] } = { valid: false, errors: [] };
        expect(() => { result = def.validateConfig(config); }).not.toThrow();
        expect(typeof result.valid).toBe('boolean');
        expect(Array.isArray(result.errors)).toBe(true);
      });

      // ── Execution ───────────────────────────────────────────────────────────
      it('execute is a function', () => {
        expect(typeof def.execute).toBe('function');
      });

      // ── Branching consistency ───────────────────────────────────────────────
      it('isBranching is a boolean', () => {
        expect(typeof def.isBranching).toBe('boolean');
      });

      it('outgoingPorts is a non-empty array', () => {
        expect(Array.isArray(def.outgoingPorts)).toBe(true);
        expect(def.outgoingPorts.length).toBeGreaterThanOrEqual(1);
      });

      it('branching node getOutgoingPortsForWorkflowNode returns non-empty array', () => {
        if (!def.isBranching) return;
        const ports = unifiedNodeRegistry.getOutgoingPortsForWorkflowNode({
          type: nodeType,
          data: { type: nodeType, config: def.defaultConfig() },
        });
        expect(ports.length).toBeGreaterThanOrEqual(1);
      });

      it('terminal nodes have maxOutDegree 0', () => {
        if (!def.isTerminal) return;
        expect(def.maxOutDegree).toBe(0);
      });
    });
  }
});

// ─── Catalog builder contract ─────────────────────────────────────────────────

describe('buildNodeCatalogText — catalog contract', () => {
  let catalogText: string;
  let entries: any[];

  beforeAll(() => {
    catalogText = buildNodeCatalogText();
    entries = JSON.parse(catalogText);
  });

  it('returns a non-empty string', () => {
    expect(typeof catalogText).toBe('string');
    expect(catalogText.length).toBeGreaterThan(0);
  });

  it('parses to a non-empty JSON array', () => {
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every catalog entry has type, label, category, description', () => {
    const bad: string[] = [];
    for (const entry of entries) {
      if (typeof entry.type !== 'string' || !entry.type.trim()) bad.push(`${entry.type}:no-type`);
      if (!Object.prototype.hasOwnProperty.call(entry, 'label')) bad.push(`${entry.type}:no-label`);
      if (!Object.prototype.hasOwnProperty.call(entry, 'category')) bad.push(`${entry.type}:no-category`);
      if (!Object.prototype.hasOwnProperty.call(entry, 'description')) bad.push(`${entry.type}:no-description`);
    }
    expect(bad).toHaveLength(0);
  });

  it('catalog entry types are unique', () => {
    const types = entries.map((e: any) => e.type);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const t of types) {
      if (seen.has(t)) dupes.push(t);
      seen.add(t);
    }
    expect(dupes).toHaveLength(0);
  });

  it('trigger nodes have isTrigger: true in catalog', () => {
    const triggerTypes = new Set(
      unifiedNodeRegistry.getAllTypes().filter(
        (t) => unifiedNodeRegistry.get(t)?.category === 'trigger'
      )
    );
    const wrong: string[] = [];
    for (const entry of entries) {
      if (triggerTypes.has(entry.type) && entry.isTrigger !== true) {
        wrong.push(entry.type);
      }
    }
    expect(wrong).toHaveLength(0);
  });

  it('catalog is parseable by ai-generator createCatalogRegistry shape (required fields present)', () => {
    const bad: string[] = [];
    for (const entry of entries) {
      if (!Object.prototype.hasOwnProperty.call(entry, 'type')) bad.push('missing:type');
      if (!Object.prototype.hasOwnProperty.call(entry, 'label')) bad.push(`${entry.type}:missing-label`);
      if (!Object.prototype.hasOwnProperty.call(entry, 'category')) bad.push(`${entry.type}:missing-category`);
      if (!Object.prototype.hasOwnProperty.call(entry, 'description')) bad.push(`${entry.type}:missing-description`);
    }
    expect(bad).toHaveLength(0);
  });
});
