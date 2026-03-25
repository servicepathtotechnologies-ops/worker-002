/**
 * Merge original user intent with the selected structured variation for Smart Planner / Gemini.
 * If we only pass a short variation (e.g. "start with manual_trigger..."), integrations
 * like google_sheets / gmail are lost; the planner must always see the raw request first.
 */
export function mergePrimaryPlannerPrompt(originalPrompt: string, structuredPrompt: string): string {
  const o = (originalPrompt || '').trim();
  const s = (structuredPrompt || '').trim();
  if (!o) return s;
  if (!s || o === s) return o;
  return `${o}\n\n---\nStructured understanding / selected phrasing:\n${s}`;
}
