export type RecipientResolutionSource = 'explicit_user_input' | 'intent_extracted_email' | 'upstream_detected_email' | 'missing';

export type RecipientResolutionResult = {
  recipientList: string[];
  source: RecipientResolutionSource;
  detectedFieldNames?: string[];
};

const EMAIL_REGEX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;

function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[),.;:]+$/g, '');
  if (!cleaned) return null;
  const match = cleaned.match(EMAIL_REGEX);
  if (!match || match.length === 0) return null;
  // Keep the first match (strip any surrounding text)
  return match[0].toLowerCase();
}

export function parseRecipientEmails(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      const n = normalizeEmail(String(v ?? ''));
      if (n) out.push(n);
    }
    return dedupe(out);
  }

  if (typeof value === 'string') {
    // Support comma/semicolon/space separated lists
    const parts = value
      .split(/[,\n;]+/g)
      .map(s => s.trim())
      .filter(Boolean);
    const out: string[] = [];
    for (const part of parts) {
      const n = normalizeEmail(part);
      if (n) out.push(n);
    }
    // If string didn’t split (single token), still try regex global
    if (out.length === 0) {
      const matches = value.match(EMAIL_REGEX) || [];
      for (const m of matches) {
        const n = normalizeEmail(m);
        if (n) out.push(n);
      }
    }
    return dedupe(out);
  }

  return [];
}

export function extractEmailsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) || [];
  return dedupe(matches.map(m => normalizeEmail(m)).filter(Boolean) as string[]);
}

export function intentImpliesMultipleRecipients(intent: string): boolean {
  const s = (intent || '').toLowerCase();
  if (!s) return false;
  return [
    'send to all',
    'to all users',
    'to everyone',
    'send to everyone',
    'send to each',
    'send to every',
    'each email',
    'all emails',
    'emails in sheet',
    'emails from sheet',
    'from the sheet',
    'bulk',
    'mass email',
    'multiple recipients',
    'to the list',
  ].some(k => s.includes(k));
}

type DetectedEmails = { emails: string[]; fieldNames: string[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list));
}

function detectEmailsInArrayOfObjects(rows: unknown[], maxRows: number): DetectedEmails {
  const emails: string[] = [];
  const fieldNames: string[] = [];
  const limited = rows.slice(0, Math.max(0, maxRows));

  for (const row of limited) {
    if (!isPlainObject(row)) continue;
    for (const [k, v] of Object.entries(row)) {
      const keyLower = k.toLowerCase();
      const keyLooksLikeEmail =
        keyLower === 'email' ||
        keyLower.includes('email') ||
        keyLower.includes('e-mail') ||
        keyLower.includes('email_address') ||
        keyLower.includes('recipient') ||
        keyLower.includes('gmail') ||
        keyLower.includes('mail');

      if (!keyLooksLikeEmail) continue;

      const found = parseRecipientEmails(v);
      if (found.length > 0) {
        emails.push(...found);
        fieldNames.push(k);
      }
    }
  }

  return { emails: dedupe(emails), fieldNames: dedupe(fieldNames) };
}

function extractCandidateDatasets(upstream: unknown): unknown[] {
  if (!upstream) return [];

  // Prefer common dataset keys used in this engine
  if (isPlainObject(upstream)) {
    const obj = upstream as Record<string, unknown>;
    const candidates: unknown[] = [];
    for (const key of ['items', 'rows', 'array', 'data', 'values']) {
      if (Array.isArray(obj[key])) candidates.push(obj[key]);
    }
    if (candidates.length > 0) return candidates;
  }

  if (Array.isArray(upstream)) return [upstream];

  return [];
}

export function resolveRecipients(params: {
  credentialInputRecipientEmails?: unknown;
  explicitTo?: unknown;
  recipientSource?: unknown;
  userIntent?: string;
  upstreamOutputs?: unknown[];
  maxRecipients?: number;
}): RecipientResolutionResult {
  const maxRecipients = params.maxRecipients ?? 100;
  const recipientSource = typeof params.recipientSource === 'string' ? params.recipientSource : '';

  // 1) Extract from intent (highest priority)
  // If the user explicitly includes an email in the prompt, always use it.
  const fromIntent = extractEmailsFromText(params.userIntent || '');
  if (fromIntent.length > 0) {
    return { recipientList: fromIntent.slice(0, maxRecipients), source: 'intent_extracted_email' };
  }

  // 2) Explicit user input (manual entry / config)
  // Always check for manual recipient emails first (highest priority after intent)
  // This handles cases where recipientEmails or 'to' field is provided regardless of recipientSource value
  const explicitFromInputs = parseRecipientEmails(params.credentialInputRecipientEmails);
  if (explicitFromInputs.length > 0) {
    return { recipientList: explicitFromInputs.slice(0, maxRecipients), source: 'explicit_user_input' };
  }

  const explicitTo = parseRecipientEmails(params.explicitTo);
  if (explicitTo.length > 0) {
    return { recipientList: explicitTo.slice(0, maxRecipients), source: 'explicit_user_input' };
  }

  // If recipientSource is explicitly 'manual_entry' and no emails found, return missing
  if (recipientSource === 'manual_entry') {
    return { recipientList: [], source: 'missing' };
  }

  // 3) Detect from upstream JSON datasets
  if (recipientSource && recipientSource !== 'extract_from_sheet') {
    return { recipientList: [], source: 'missing' };
  }

  const upstreamOutputs = params.upstreamOutputs || [];
  let allEmails: string[] = [];
  let allFields: string[] = [];

  for (const out of upstreamOutputs) {
    const datasets = extractCandidateDatasets(out);
    for (const ds of datasets) {
      if (!Array.isArray(ds)) continue;
      const detected = detectEmailsInArrayOfObjects(ds, 500);
      if (detected.emails.length > 0) {
        allEmails.push(...detected.emails);
        allFields.push(...detected.fieldNames);
      }
    }
  }

  allEmails = dedupe(allEmails).slice(0, maxRecipients);
  allFields = dedupe(allFields);

  if (allEmails.length > 0) {
    return {
      recipientList: allEmails,
      source: 'upstream_detected_email',
      detectedFieldNames: allFields,
    };
  }

  return { recipientList: [], source: 'missing' };
}

