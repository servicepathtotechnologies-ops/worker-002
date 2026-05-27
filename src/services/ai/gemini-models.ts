export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash';
export const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview';
export const GEMINI_LITE_MODEL = 'gemini-3.1-flash-lite';

export const GEMINI_MODELS = [
  GEMINI_DEFAULT_MODEL,
  GEMINI_PRO_MODEL,
  GEMINI_LITE_MODEL,
] as const;

export type GeminiModel = typeof GEMINI_MODELS[number];

const GEMINI_MODEL_ALIASES: Record<string, GeminiModel> = {
  'gemini-1.5-flash': GEMINI_DEFAULT_MODEL,
  'gemini-2.5-flash': GEMINI_DEFAULT_MODEL,
  'gemini-3.5-flash': GEMINI_DEFAULT_MODEL,
  'gemini-3-flash': GEMINI_DEFAULT_MODEL,

  'gemini-pro': GEMINI_PRO_MODEL,
  'gemini-1.5-pro': GEMINI_PRO_MODEL,
  'gemini-2.5-pro': GEMINI_PRO_MODEL,
  'gemini-3.1-pro': GEMINI_PRO_MODEL,
  'gemini-3.1-pro-preview': GEMINI_PRO_MODEL,

  'gemini-2.0-flash-lite': GEMINI_LITE_MODEL,
  'gemini-2.5-flash-lite': GEMINI_LITE_MODEL,
  'gemini-3-flash-preview': GEMINI_LITE_MODEL,
  'gemini-3.1-flash-lite': GEMINI_LITE_MODEL,
  'gemini-3.1-flash-lite-preview': GEMINI_LITE_MODEL,
};

export function normalizeGeminiModel(model?: string): GeminiModel {
  if (!model) return GEMINI_DEFAULT_MODEL;
  return GEMINI_MODEL_ALIASES[model] || GEMINI_DEFAULT_MODEL;
}

export function getGeminiFallbackModels(primaryModel: string): GeminiModel[] {
  const primary = normalizeGeminiModel(primaryModel);
  return GEMINI_MODELS.filter((model) => model !== primary);
}
