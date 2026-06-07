/**
 * Day 33 — Registry ↔ Frontend Parity Test
 *
 * Ensures that every type in the frontend BACKEND_SUPPORTED_NODE_TYPES allowlist
 * has a corresponding entry in unifiedNodeRegistry, and that high-traffic nodes
 * have non-empty label/category.
 *
 * Reading the frontend file as text avoids a cross-package tsconfig dependency.
 *
 * Run:
 *   cd worker && npx jest src/core/registry/__tests__/registry-frontend-parity.test.ts --runInBand
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { unifiedNodeRegistry } from '../unified-node-registry';

// ─── Parse the frontend allowlist from source text ───────────────────────────

function parseFrontendAllowlist(filePath: string): string[] {
  const src = fs.readFileSync(filePath, 'utf-8');
  // Match every quoted string inside the Set(...) block
  const setMatch = src.match(/new Set\(\[([\s\S]*?)\]\)/);
  if (!setMatch) return [];
  const types: string[] = [];
  const re = /'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(setMatch[1])) !== null) {
    types.push(m[1]);
  }
  return types;
}

const FRONTEND_FILE = path.resolve(
  __dirname,
  '../../../../../ctrl_checks/src/components/workflow/backendSupportedNodeTypes.ts'
);

// High-traffic nodes that must always be present and have valid registry metadata
const HIGH_TRAFFIC_NODES = [
  'google_gmail',
  'google_sheets',
  'slack_message',
  'manual_trigger',
  'if_else',
  'switch',
  'log_output',
];

// Known frontend-only types that exist in the allowlist but are deprecated/utility
// and may legitimately be absent from the live registry (document exceptions here).
// Keep this as short as possible — an empty list is ideal.
const KNOWN_ALLOWLIST_EXCEPTIONS: string[] = [];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registry ↔ frontend parity', () => {
  let allowlist: string[];

  beforeAll(() => {
    if (!fs.existsSync(FRONTEND_FILE)) {
      throw new Error(`Frontend backendSupportedNodeTypes.ts not found at: ${FRONTEND_FILE}`);
    }
    allowlist = parseFrontendAllowlist(FRONTEND_FILE);
    expect(allowlist.length).toBeGreaterThan(0);
  });

  it('frontend allowlist parses to a non-empty array', () => {
    expect(allowlist.length).toBeGreaterThan(0);
  });

  it('every BACKEND_SUPPORTED_NODE_TYPES entry exists in unifiedNodeRegistry', () => {
    const registryTypes = new Set(unifiedNodeRegistry.getAllTypes());
    const mismatches: string[] = [];

    for (const type of allowlist) {
      if (KNOWN_ALLOWLIST_EXCEPTIONS.includes(type)) continue;
      if (!registryTypes.has(type)) {
        mismatches.push(type);
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `Frontend declares these backend-supported types that are MISSING from unifiedNodeRegistry:\n` +
          mismatches.map((t) => `  - ${t}`).join('\n') +
          `\n\nFix: register missing nodes in unified-node-registry.ts, or add to KNOWN_ALLOWLIST_EXCEPTIONS if intentional.`
      );
    }
    expect(mismatches).toHaveLength(0);
  });

  for (const nodeType of HIGH_TRAFFIC_NODES) {
    describe(`high-traffic node: ${nodeType}`, () => {
      it(`${nodeType} exists in registry`, () => {
        expect(unifiedNodeRegistry.has(nodeType)).toBe(true);
      });

      it(`${nodeType} has non-empty label`, () => {
        const def = unifiedNodeRegistry.get(nodeType);
        expect(def?.label?.trim().length).toBeGreaterThan(0);
      });

      it(`${nodeType} has non-empty category`, () => {
        const def = unifiedNodeRegistry.get(nodeType);
        expect(def?.category?.trim().length).toBeGreaterThan(0);
      });
    });
  }

  it('registry has no types missing from the frontend allowlist (reverse parity info)', () => {
    // This is informational — registry may have nodes not yet exposed to frontend.
    // We log mismatches rather than fail, since new backend nodes may precede frontend adoption.
    const allowlistSet = new Set(allowlist);
    const registryOnly = unifiedNodeRegistry
      .getAllTypes()
      .filter((t) => !allowlistSet.has(t));
    // Only warn — do not fail. Uncomment the expect to harden this.
    if (registryOnly.length > 0) {
      console.warn(
        `[parity] ${registryOnly.length} registry nodes not yet in frontend allowlist:\n` +
          registryOnly.slice(0, 20).join(', ') +
          (registryOnly.length > 20 ? ` … (+${registryOnly.length - 20} more)` : '')
      );
    }
    expect(true).toBe(true); // informational only
  });
});
