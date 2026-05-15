import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { getGoogleTokenForContext, googleApiRequest, mergedInputs } from './google-workspace-utils';

function isValidDateOnly(datePart: string): boolean {
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toGoogleTasksDueDate(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  // Runtime expressions may be resolved later by the workflow engine. Do not
  // mangle them into a date while they are still template strings.
  if (raw.includes('{{')) return raw;

  // Google Tasks stores only the calendar day. Preserve the user-entered day
  // from ISO/RFC3339 values instead of shifting it through UTC conversion.
  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
  if (isoDate) {
    if (!isValidDateOnly(isoDate[1])) {
      throw new Error(`Invalid Google Tasks due date: ${raw}`);
    }
    return `${isoDate[1]}T00:00:00.000Z`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Google Tasks due date must be a calendar date, for example 2026-12-31');
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function compactTaskPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

export function overrideGoogleTasks(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {
  const manualStatic = { default: 'manual_static' as const, supportsRuntimeAI: false, supportsBuildtimeAI: false };
  const runtimeValue = { default: 'manual_static' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true };
  const buildtimeValue = { default: 'buildtime_ai_once' as const, supportsRuntimeAI: false, supportsBuildtimeAI: true };
  const options = ['create', 'read', 'update', 'delete'].map((value) => ({ label: value.charAt(0).toUpperCase() + value.slice(1), value }));
  const inputSchema = {
    ...def.inputSchema,
    operation: { ...def.inputSchema.operation, ui: { ...(def.inputSchema.operation?.ui || {}), options } },
    taskListId: {
      type: 'string' as const,
      description: 'Google Tasks task list ID. Use @default for the primary list.',
      required: false,
      default: '@default',
      role: 'id' as const,
      fillMode: manualStatic,
    },
    title: { type: 'string' as const, description: 'Task title', required: false, role: 'title_like' as const, fillMode: runtimeValue },
    notes: { type: 'string' as const, description: 'Task notes/details', required: false, role: 'long_body' as const, fillMode: runtimeValue },
    due: {
      type: 'string' as const,
      description: 'Due date for the task. Use a local calendar date such as 2026-12-31. Google Tasks records due dates at day level; time of day is not saved by the Google Tasks API.',
      required: false,
      role: 'config' as const,
      fillMode: buildtimeValue,
      examples: ['2026-12-31'],
      ui: { widget: 'date' as const },
    },
    status: { type: 'string' as const, description: 'Task status, for example needsAction or completed', required: false, role: 'config' as const, fillMode: buildtimeValue },
  };

  return {
    ...def,
    inputSchema,
    credentialSchema: {
      requirements: [{ provider: 'google', category: 'oauth', required: true, description: 'Google OAuth with Tasks scope' }],
      credentialFields: ['accessToken'],
    },
    execute: async (context) => {
      const inputs = mergedInputs(context);
      const operation = String(inputs.operation || 'read');
      const taskListId = encodeURIComponent(String(inputs.taskListId || '@default'));
      try {
        const accessToken = await getGoogleTokenForContext(context, ['https://www.googleapis.com/auth/tasks']);
        let output: any;
        if (operation === 'read') {
          if (inputs.taskId) {
            output = await googleApiRequest(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${encodeURIComponent(String(inputs.taskId))}`, accessToken);
          } else {
            output = await googleApiRequest(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, accessToken);
          }
        } else if (operation === 'create') {
          if (!inputs.title) throw new Error('title is required for create');
          const due = toGoogleTasksDueDate(inputs.due ?? inputs.dueDate);
          output = await googleApiRequest(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, accessToken, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(compactTaskPayload({ title: inputs.title, notes: inputs.notes, due })),
          });
        } else if (operation === 'update') {
          if (!inputs.taskId) throw new Error('taskId is required for update');
          const due = toGoogleTasksDueDate(inputs.due ?? inputs.dueDate);
          output = await googleApiRequest(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${encodeURIComponent(String(inputs.taskId))}`, accessToken, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(compactTaskPayload({ title: inputs.title, notes: inputs.notes, due, status: inputs.status })),
          });
        } else if (operation === 'delete') {
          if (!inputs.taskId) throw new Error('taskId is required for delete');
          await googleApiRequest(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${encodeURIComponent(String(inputs.taskId))}`, accessToken, { method: 'DELETE' });
          output = { deleted: true, taskId: inputs.taskId };
        } else {
          throw new Error(`Unsupported Google Tasks operation: ${operation}`);
        }
        return { success: true, output: { operation, data: output } };
      } catch (error: any) {
        return { success: false, error: { code: 'GOOGLE_TASKS_FAILED', message: error?.message || 'Google Tasks operation failed' } };
      }
    },
  };
}
