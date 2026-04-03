import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { AiEditorCapability } from '../../core/types/ai-editor-auth';

export type AiEditorAuditAction = 'analyze' | 'suggest' | 'apply' | 'capabilities';

export interface AiEditorAuditEntry {
  id: string;
  createdAt: string;
  action: AiEditorAuditAction;
  userId: string;
  workflowId?: string;
  versionIdOrHash?: string;
  validationPassed?: boolean;
  operationsSummary?: string;
  operationsCount?: number;
  errors?: string[];
  warnings?: string[];
  diffHash?: string;
  promptPreview?: string;
  telemetryMs?: number;
  capabilities?: AiEditorCapability[];
}

const DEFAULT_LOG_DIR = path.join(process.cwd(), 'logs');
const AUDIT_FILENAME = 'ai-editor-audit.jsonl';

function auditFilePath(): string {
  const dir = process.env.AI_EDITOR_AUDIT_LOG_DIR || DEFAULT_LOG_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, AUDIT_FILENAME);
}

function hashDiff(preview: unknown): string | undefined {
  if (preview === undefined || preview === null) return undefined;
  try {
    const h = crypto.createHash('sha256');
    h.update(JSON.stringify(preview));
    return h.digest('hex').slice(0, 16);
  } catch {
    return undefined;
  }
}

/**
 * Append one audit row (JSONL). Safe for enterprise logging pipelines.
 */
export function logAiEditorEvent(entry: Omit<AiEditorAuditEntry, 'id' | 'createdAt'> & { id?: string }): AiEditorAuditEntry {
  const full: AiEditorAuditEntry = {
    id: entry.id || `ae_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };

  try {
    fs.appendFileSync(auditFilePath(), `${JSON.stringify(full)}\n`, { encoding: 'utf8' });
  } catch (e) {
    console.warn('[ai-editor-audit] Failed to write audit log:', e);
  }

  if (process.env.AI_EDITOR_AUDIT_CONSOLE === '1' || process.env.AI_EDITOR_AUDIT_CONSOLE === 'true') {
    console.log('[ai-editor-audit]', full.action, full.userId, full.workflowId || '-', full.operationsSummary || '');
  }

  return full;
}

export function readAiEditorAuditForWorkflow(workflowId: string, limit = 100): AiEditorAuditEntry[] {
  const file = auditFilePath();
  if (!fs.existsSync(file)) {
    return [];
  }
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const out: AiEditorAuditEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      const row = JSON.parse(lines[i]) as AiEditorAuditEntry;
      if (row.workflowId === workflowId) {
        out.push(row);
      }
    } catch {
      // skip bad line
    }
  }
  return out;
}

export { hashDiff };
