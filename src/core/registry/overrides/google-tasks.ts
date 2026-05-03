import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { getGoogleTokenForContext, googleApiRequest, mergedInputs } from './google-workspace-utils';

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
    due: { type: 'string' as const, description: 'Due date/time in RFC3339 format', required: false, role: 'config' as const, fillMode: buildtimeValue },
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
        const accessToken = await getGoogleTokenForContext(context);
        let output: any;
        if (operation === 'read') {
          if (inputs.taskId) {
            output = await googleApiRequest(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${encodeURIComponent(String(inputs.taskId))}`, accessToken);
          } else {
            output = await googleApiRequest(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, accessToken);
          }
        } else if (operation === 'create') {
          if (!inputs.title) throw new Error('title is required for create');
          output = await googleApiRequest(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, accessToken, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: inputs.title, notes: inputs.notes, due: inputs.due }),
          });
        } else if (operation === 'update') {
          if (!inputs.taskId) throw new Error('taskId is required for update');
          output = await googleApiRequest(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${encodeURIComponent(String(inputs.taskId))}`, accessToken, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: inputs.title, notes: inputs.notes, due: inputs.due, status: inputs.status }),
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
