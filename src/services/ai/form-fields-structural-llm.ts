/**
 * Optional build-time LLM: proposes form.fields when deterministic extraction yields nothing
 * or when STRUCTURAL_FORM_FIELDS_LLM=true (opt-in). Uses only getFormStructuralIntentText (user prompt).
 */

import type { Workflow } from '../../core/types/ai-types';
import { LLMAdapter } from '../../shared/llm-adapter';
import { unifiedNormalizeNodeType } from '../../core/utils/unified-node-type-normalizer';
import { getFormStructuralIntentText } from './structure-materializer';

const ALLOWED_TYPES = new Set(['text', 'email', 'number', 'tel', 'textarea', 'file', 'select', 'checkbox']);

function normalizeFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function inferType(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('email')) return 'email';
  if (k.includes('age') || k.includes('count') || k.includes('qty')) return 'number';
  if (k.includes('phone') || k.includes('mobile')) return 'tel';
  if (k.includes('message') || k.includes('description') || k.includes('comment')) return 'textarea';
  if (k.includes('file') || k.includes('attachment')) return 'file';
  return 'text';
}

/**
 * When STRUCTURAL_FORM_FIELDS_LLM=true and GEMINI_API_KEY is set, fill empty form.fields from user intent.
 * Falls back silently on any error.
 */
export async function hydrateFormFieldsFromLlmIfEnabled(workflow: Workflow): Promise<Workflow> {
  if (process.env.STRUCTURAL_FORM_FIELDS_LLM !== 'true' || !process.env.GEMINI_API_KEY) {
    return workflow;
  }

  const intent = getFormStructuralIntentText(workflow);
  if (!intent.trim()) return workflow;

  const hasEmptyForm = (workflow.nodes || []).some((node: any) => {
    const nodeType = unifiedNormalizeNodeType(node);
    if (nodeType !== 'form') return false;
    const fields = node.data?.config?.fields;
    return !Array.isArray(fields) || fields.length === 0;
  });
  if (!hasEmptyForm) return workflow;

  try {
    const adapter = new LLMAdapter();
    const userContent = `User request (form fields only, no workflow nodes):\n${intent.slice(0, 4000)}\n\nReturn a JSON array of objects: [{"key":"snake_case","label":"Human Label","type":"text|email|number|tel|textarea|file|select|checkbox"}]. Only fields the user should fill on a form. No explanation.`;

    const response = await adapter.chat(
      'gemini',
      [
        {
          role: 'system',
          content:
            'You output only valid JSON: an array of form field definitions. Keys must be snake_case. No markdown.',
        },
        { role: 'user', content: userContent },
      ],
      { model: 'gemini-2.0-flash', apiKey: process.env.GEMINI_API_KEY, temperature: 0.2 }
    );

    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }
    const parsed = JSON.parse(jsonStr) as Array<{ key?: string; label?: string; type?: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return workflow;

    const built = parsed
      .map((row) => {
        const key = normalizeFieldKey(String(row.key || row.label || ''));
        if (!key) return null;
        const type = ALLOWED_TYPES.has(String(row.type || '').toLowerCase())
          ? String(row.type).toLowerCase()
          : inferType(key);
        const label = String(row.label || key).slice(0, 200);
        return {
          id: `field_${key}`,
          key,
          name: key,
          label,
          type,
          required: true,
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    if (built.length === 0) return workflow;

    const nextNodes = (workflow.nodes || []).map((node: any) => {
      const nodeType = unifiedNormalizeNodeType(node);
      if (nodeType !== 'form') return node;
      const fields = node.data?.config?.fields;
      if (Array.isArray(fields) && fields.length > 0) return node;
      const cfg = { ...(node.data?.config || {}), fields: built };
      return {
        ...node,
        data: { ...(node.data || {}), config: cfg },
      };
    });

    return { ...workflow, nodes: nextNodes };
  } catch {
    return workflow;
  }
}
