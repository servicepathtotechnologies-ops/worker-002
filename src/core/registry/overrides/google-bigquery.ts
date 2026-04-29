import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { getGoogleTokenForContext, googleApiRequest, mergedInputs } from './google-workspace-utils';

export function overrideGoogleBigQuery(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {
  const manualStatic = { default: 'manual_static' as const, supportsRuntimeAI: false, supportsBuildtimeAI: false };
  return {
    ...def,
    inputSchema: {
      ...def.inputSchema,
      projectId: {
        ...def.inputSchema.projectId,
        required: true,
      },
      useLegacySql: {
        type: 'boolean',
        description: 'Whether to use BigQuery legacy SQL. Defaults to false.',
        required: false,
        default: false,
        fillMode: manualStatic,
      },
    },
    requiredInputs: Array.from(new Set([...(def.requiredInputs || []), 'projectId'])),
    credentialSchema: {
      requirements: [{ provider: 'google', category: 'oauth', required: true, description: 'Google OAuth with BigQuery scope' }],
      credentialFields: ['accessToken'],
    },
    execute: async (context) => {
      const inputs = mergedInputs(context);
      try {
        const projectId = String(inputs.projectId || '').trim();
        const query = String(inputs.query || '').trim();
        if (!projectId) throw new Error('projectId is required');
        if (!query) throw new Error('query is required');
        const accessToken = await getGoogleTokenForContext(context);
        const output = await googleApiRequest(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`, accessToken, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            useLegacySql: inputs.useLegacySql === true || inputs.useLegacySql === 'true',
            timeoutMs: Number(inputs.timeoutMs || 30000),
          }),
        });
        return { success: true, output: { operation: 'query', data: output } };
      } catch (error: any) {
        return { success: false, error: { code: 'GOOGLE_BIGQUERY_FAILED', message: error?.message || 'Google BigQuery query failed' } };
      }
    },
  };
}
