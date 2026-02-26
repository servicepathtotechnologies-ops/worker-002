/**
 * Intent-Aware Property Selector
 *
 * Goal: Given the user's intent (prompt) and upstream JSON, select the most relevant
 * property/properties to summarize. This is deterministic and schema-agnostic.
 *
 * - If intent mentions a specific property (e.g. "resume", "roll number"), select that field.
 * - If not, return the full dataset (usually items/rows).
 *
 * This is used by AI nodes BEFORE calling the LLM to prevent blindly summarizing full JSON
 * when a user asked for a specific field.
 */

export interface IntentAwareSelectionResult {
  mode: 'filtered' | 'full';
  matchedProperties: string[];
  extractedProperties: string[];
  filteredData: unknown;
  explanation: string;
}

export interface IntentAwareSelectorOptions {
  maxRecordsToScan?: number;
  minMatchScore?: number; // 0..1
}

const DEFAULT_OPTIONS: Required<IntentAwareSelectorOptions> = {
  maxRecordsToScan: 10,
  minMatchScore: 0.84,
};

export function intentAwarePropertySelect(
  userPrompt: string,
  upstreamJson: unknown,
  options: IntentAwareSelectorOptions = {}
): IntentAwareSelectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const prompt = (userPrompt || '').trim();

  const dataset = pickDatasetRoot(upstreamJson);
  const records = Array.isArray(dataset) ? dataset : null;

  // Extract candidate intent terms from prompt (deterministic heuristics)
  const intentTerms = extractCandidatePropertyTerms(prompt);

  // Extract available properties
  const availableProps = records
    ? extractRecordKeys(records, opts.maxRecordsToScan)
    : extractObjectKeys(dataset);

  // If no intent terms, or no available properties, fall back to full dataset
  if (intentTerms.length === 0 || availableProps.length === 0) {
    return {
      mode: 'full',
      matchedProperties: [],
      extractedProperties: availableProps,
      filteredData: dataset,
      explanation:
        intentTerms.length === 0
          ? 'No specific property requested in user intent; using full dataset.'
          : 'No properties found in upstream data; using full dataset.',
    };
  }

  // Match intent terms to available properties
  const scored = scoreMatches(intentTerms, availableProps);
  const best = scored
    .filter(s => s.score >= opts.minMatchScore)
    .sort((a, b) => b.score - a.score);

  if (best.length === 0) {
    return {
      mode: 'full',
      matchedProperties: [],
      extractedProperties: availableProps,
      filteredData: dataset,
      explanation: `No property matched intent terms (${intentTerms.join(', ')}); using full dataset.`,
    };
  }

  // Choose all properties that are "close enough" to the best score (within 0.03)
  const topScore = best[0].score;
  const matched = best
    .filter(b => b.score >= topScore - 0.03)
    .map(b => b.property);

  const filtered = filterDatasetByProperties(dataset, matched, opts.maxRecordsToScan);

  return {
    mode: 'filtered',
    matchedProperties: matched,
    extractedProperties: availableProps,
    filteredData: filtered,
    explanation: `Matched properties (${matched.join(', ')}) from intent terms (${intentTerms.join(', ')}).`,
  };
}

function pickDatasetRoot(upstreamJson: unknown): unknown {
  if (!upstreamJson || typeof upstreamJson !== 'object') return upstreamJson;
  const obj = upstreamJson as Record<string, unknown>;

  // Prefer tabular datasets commonly produced by spreadsheet nodes
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.values)) return obj.values;

  return upstreamJson;
}

function extractRecordKeys(records: unknown[], maxScan: number): string[] {
  const keys = new Set<string>();
  const scan = records.slice(0, Math.max(1, maxScan));
  for (const r of scan) {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      Object.keys(r as Record<string, unknown>).forEach(k => keys.add(k));
    }
  }
  return Array.from(keys);
}

function extractObjectKeys(value: unknown): string[] {
  const keys = new Set<string>();
  if (!value || typeof value !== 'object') return [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const item of v.slice(0, 5)) walk(item);
      return;
    }
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      keys.add(k);
      walk(o[k]);
    }
  };
  walk(value);
  return Array.from(keys);
}

function extractCandidatePropertyTerms(prompt: string): string[] {
  if (!prompt) return [];
  const p = prompt.toLowerCase();

  // Try to capture phrases after verbs that indicate selection
  const patterns = [
    /summari[sz]e\s+(?:the\s+)?(.+?)(?:\s+from|\s+in|\s+of|\s+using|\s+into|\s+to|\s*$)/,
    /extract\s+(?:the\s+)?(.+?)(?:\s+from|\s+in|\s+of|\s+using|\s+into|\s+to|\s*$)/,
    /list\s+(?:the\s+)?(.+?)(?:\s+from|\s+in|\s+of|\s+using|\s+into|\s+to|\s*$)/,
    /show\s+(?:the\s+)?(.+?)(?:\s+from|\s+in|\s+of|\s+using|\s+into|\s+to|\s*$)/,
  ];

  let captured: string | null = null;
  for (const re of patterns) {
    const m = p.match(re);
    if (m?.[1]) {
      captured = m[1];
      break;
    }
  }

  // If nothing captured, look for "only <x>" / "just <x>"
  if (!captured) {
    const m = p.match(/\b(?:only|just)\s+(.+?)(?:\s+from|\s+in|\s+of|\s+using|\s+into|\s+to|\s*$)/);
    if (m?.[1]) captured = m[1];
  }

  if (!captured) return [];

  // Split into candidate terms
  const raw = captured
    .split(/,|and|&|\//g)
    .map(s => s.trim())
    .filter(Boolean);

  // Remove generic words that should not be treated as properties
  const stop = new Set([
    'data',
    'sheet',
    'spreadsheet',
    'rows',
    'row',
    'items',
    'item',
    'values',
    'value',
    'records',
    'record',
    'table',
    'tables',
    'information',
    'details',
    'content',
  ]);

  return raw
    .map(t => t.replace(/[^\w\s-]/g, '').trim())
    .filter(t => t.length >= 3)
    .filter(t => !stop.has(t));
}

function scoreMatches(intentTerms: string[], properties: string[]) {
  const results: Array<{ property: string; score: number; term: string }> = [];
  for (const prop of properties) {
    let best = { score: 0, term: '' };
    for (const term of intentTerms) {
      const s = similarityScore(term, prop);
      if (s > best.score) best = { score: s, term };
    }
    results.push({ property: prop, score: best.score, term: best.term });
  }
  return results;
}

function normalize(s: string): string {
  const t = (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  // light stemming: remove trailing plural 's' for longer tokens
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

function similarityScore(a: string, b: string): number {
  const A = normalize(a);
  const B = normalize(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.92;

  // token overlap on word boundaries (helps: "roll number" vs "rollNumber")
  const aw = (a || '').toLowerCase().split(/\s+/).map(normalize).filter(Boolean);
  const bw = (b || '').toLowerCase().split(/\s+/).map(normalize).filter(Boolean);
  const aSet = new Set(aw);
  const bSet = new Set(bw);
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  const union = new Set([...aSet, ...bSet]).size;
  const jaccard = union > 0 ? inter / union : 0;

  // char trigram Dice coefficient (simple, deterministic)
  const dice = diceCoefficient(A, B);

  return Math.max(jaccard, dice);
}

function diceCoefficient(a: string, b: string): number {
  if (a.length < 3 || b.length < 3) return 0;
  const grams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 2; i++) {
      const g = s.slice(i, i + 3);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  };
  const A = grams(a);
  const B = grams(b);
  let matches = 0;
  for (const [g, c] of A.entries()) {
    const c2 = B.get(g) || 0;
    matches += Math.min(c, c2);
  }
  const total = Array.from(A.values()).reduce((x, y) => x + y, 0) + Array.from(B.values()).reduce((x, y) => x + y, 0);
  return total > 0 ? (2 * matches) / total : 0;
}

function filterDatasetByProperties(dataset: unknown, properties: string[], maxScan: number): unknown {
  if (!dataset) return dataset;
  if (Array.isArray(dataset)) {
    const records = dataset.slice(0, Math.max(1, maxScan));
    const isRecordObjects = records.every(r => r && typeof r === 'object' && !Array.isArray(r));
    if (!isRecordObjects) {
      // If it's not an array of objects, we can't select object properties
      return dataset;
    }

    if (properties.length === 1) {
      const key = properties[0];
      return dataset.map((r: any) => (r && typeof r === 'object' ? (r as any)[key] : undefined));
    }

    return dataset.map((r: any) => {
      if (!r || typeof r !== 'object') return r;
      const out: Record<string, unknown> = {};
      for (const k of properties) out[k] = (r as any)[k];
      return out;
    });
  }

  // For objects, return a reduced object containing matched keys at top-level when possible
  if (typeof dataset === 'object') {
    const o = dataset as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of properties) {
      if (k in o) out[k] = o[k];
    }
    // If nothing matched at top-level, leave dataset unchanged (avoid losing structure)
    return Object.keys(out).length > 0 ? out : dataset;
  }

  return dataset;
}
