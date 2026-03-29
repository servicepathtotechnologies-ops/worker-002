/**
 * Universal structural prompt fragment: per-node field fill semantics from UnifiedNodeRegistry.
 * Single source of truth — no per-node string hacks; derives from inputSchema.fillMode + ownership.
 */

import type { FieldFillMode, NodeInputField } from '../../core/types/unified-node-contract';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface StructuralFillContractOptions {
  /** Cap listed fields per fill-mode bucket to keep prompts bounded */
  maxFieldsPerBucket?: number;
}

function effectiveFillDefault(field: NodeInputField): FieldFillMode {
  return field.fillMode?.default ?? 'manual_static';
}

/**
 * Human- and model-facing section: for each distinct node type in order, lists fields grouped by
 * default fill strategy so builders know what AI pre-fills at build time vs runtime vs user/static.
 */
export function buildRegistryStructuralFillContractSection(
  nodeTypes: string[],
  options?: StructuralFillContractOptions
): string {
  const maxPer = options?.maxFieldsPerBucket ?? 14;
  const lines: string[] = [];

  lines.push('## Configuration contract (registry — how fields are filled)');
  lines.push('');
  lines.push('Semantics (universal):');
  lines.push(
    '- **manual_static**: user, vault/credential attach, or fixed config — not inferred by build-time AI unless user unlocks.'
  );
  lines.push(
    '- **buildtime_ai_once**: AI may generate a static value once during workflow build/configure; user can edit before run.'
  );
  lines.push(
    '- **runtime_ai**: executor resolves from upstream JSON + workflow intent when the node runs; may stay empty in saved graph until first execution.'
  );
  lines.push(
    '- **ownership=structural** (when shown): shape-defining (form `fields`, if_else `conditions`, switch `cases`, etc.) — required for structural validity; honor the field default fill mode.'
  );
  lines.push(
    '- **ownership=credential**: secrets / webhook URLs / OAuth — attach-credentials or vault; not AI-filled by default.'
  );
  lines.push('');

  const seenType = new Set<string>();
  for (const raw of nodeTypes) {
    const nt = unifiedNormalizeNodeTypeString(String(raw || '').trim()) || String(raw || '').trim();
    if (!nt || seenType.has(nt)) continue;
    seenType.add(nt);

    const def = unifiedNodeRegistry.get(nt);
    if (!def?.inputSchema || typeof def.inputSchema !== 'object') continue;

    const label = def.label || nt;
    const buckets: Record<FieldFillMode, string[]> = {
      manual_static: [],
      runtime_ai: [],
      buildtime_ai_once: [],
    };

    for (const [name, field] of Object.entries(def.inputSchema)) {
      if (name.startsWith('_')) continue;
      if (!field || typeof field !== 'object') continue;
      const f = field as NodeInputField;
      const mode = effectiveFillDefault(f);
      const req = f.required ? 'required' : 'optional';
      const own = f.ownership ? ` ownership=${f.ownership}` : '';
      const role = f.role ? ` role=${f.role}` : '';
      const entry = `${name} (${req}${own}${role})`;
      if (buckets[mode].length < maxPer) {
        buckets[mode].push(entry);
      }
    }

    const parts: string[] = [];
    (['buildtime_ai_once', 'runtime_ai', 'manual_static'] as const).forEach((mode) => {
      if (buckets[mode].length > 0) {
        parts.push(`${mode}: ${buckets[mode].join('; ')}`);
      }
    });
    if (parts.length === 0) continue;

    lines.push(`### ${label} (\`${nt}\`)`);
    for (const p of parts) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  lines.push('**Planner rules:** Enumerate every node in the architecture; for branching, one `log_output` terminal per branch path. Never omit structural required fields from the narrative.');
  return lines.join('\n').trimEnd();
}
