import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { basicAuthHeader, mergeContextInputs, stripTrailingSlash } from './http-integration-utils';

function jobPath(jobName: string): string {
  return jobName
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `job/${encodeURIComponent(part)}`)
    .join('/');
}

async function readJenkinsPayload(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function jenkinsRequest(url: string, init: RequestInit, expectJson = false): Promise<any> {
  const response = await fetch(url, init);
  const payload = await readJenkinsPayload(response);
  if (!response.ok) {
    const message = payload?.message || payload?.detail || (typeof payload === 'string' ? payload : '') || `Jenkins API error ${response.status}`;
    throw new Error(message);
  }
  if (expectJson) return payload;
  return {
    status: response.status,
    location: response.headers.get('location') || undefined,
    data: payload,
  };
}

async function getCrumb(baseUrl: string, headers: Record<string, string>): Promise<Record<string, string>> {
  try {
    const payload = await jenkinsRequest(`${baseUrl}/crumbIssuer/api/json`, { headers }, true);
    if (payload?.crumbRequestField && payload?.crumb) {
      return { [payload.crumbRequestField]: payload.crumb };
    }
  } catch {
    // Many Jenkins installations disable crumbs for API-token requests.
  }
  return {};
}

export function overrideJenkins(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
  const manualStatic = { default: 'manual_static' as const, supportsRuntimeAI: false, supportsBuildtimeAI: false };
  const operationOptions = ['build', 'status', 'cancel'].map((value) => ({
    label: value.charAt(0).toUpperCase() + value.slice(1),
    value,
  }));

  const inputSchema = {
    ...def.inputSchema,
    operation: {
      ...def.inputSchema.operation,
      ui: { ...(def.inputSchema.operation?.ui || {}), options: operationOptions },
    },
    baseUrl: {
      type: 'string' as const,
      description: 'Jenkins base URL, e.g. https://jenkins.example.com',
      required: true,
      role: 'config' as const,
      helpCategory: 'base_url' as const,
      fillMode: manualStatic,
    },
    username: {
      type: 'string' as const,
      description: 'Jenkins username',
      required: true,
      ownership: 'credential' as const,
      role: 'config' as const,
      helpCategory: 'generic_credential' as const,
      fillMode: manualStatic,
    },
    apiToken: {
      type: 'string' as const,
      description: 'Jenkins API token',
      required: true,
      ownership: 'credential' as const,
      role: 'config' as const,
      helpCategory: 'api_key' as const,
      fillMode: manualStatic,
    },
    jobName: {
      ...def.inputSchema.jobName,
      required: false,
      role: 'id' as const,
    },
    buildNumber: {
      type: 'string' as const,
      description: 'Build number for status or cancel operations',
      required: false,
      role: 'id' as const,
      fillMode: manualStatic,
    },
    parameters: {
      type: 'object' as const,
      description: 'Jenkins build parameters for parameterized jobs',
      required: false,
      role: 'raw_json' as const,
      fillMode: { default: 'manual_static' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true },
    },
  };

  return {
    ...def,
    inputSchema,
    requiredInputs: Array.from(new Set([...(def.requiredInputs || []), 'baseUrl', 'username', 'apiToken'])),
    credentialSchema: {
      requirements: [{ provider: 'jenkins', category: 'api_key', required: true, description: 'Jenkins username and API token' }],
      credentialFields: ['username', 'apiToken'],
    },
    execute: async (context) => {
      const inputs = mergeContextInputs(context);
      const operation = String(inputs.operation || 'build');
      const baseUrl = stripTrailingSlash(String(inputs.baseUrl || inputs.url || '').trim());
      const username = String(inputs.username || '').trim();
      const apiToken = String(inputs.apiToken || '').trim();
      const name = String(inputs.jobName || '').trim();

      try {
        if (!baseUrl) throw new Error('baseUrl is required');
        if (!username) throw new Error('username is required');
        if (!apiToken) throw new Error('apiToken is required');
        if (!name) throw new Error('jobName is required');
        const path = jobPath(name);
        if (!path) throw new Error('jobName is required');
        const authHeaders = basicAuthHeader(username, apiToken);
        const postHeaders = { ...authHeaders, ...(await getCrumb(baseUrl, authHeaders)) };

        let output: any;
        if (operation === 'build') {
          const parameters = inputs.parameters && typeof inputs.parameters === 'object' ? inputs.parameters : {};
          const hasParameters = Object.keys(parameters).length > 0;
          if (hasParameters) {
            const body = new URLSearchParams();
            Object.entries(parameters).forEach(([key, value]) => body.set(key, String(value)));
            output = await jenkinsRequest(`${baseUrl}/${path}/buildWithParameters`, {
              method: 'POST',
              headers: { ...postHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
              body,
            });
          } else {
            output = await jenkinsRequest(`${baseUrl}/${path}/build`, { method: 'POST', headers: postHeaders });
          }
        } else if (operation === 'status') {
          const buildRef = inputs.buildNumber ? encodeURIComponent(String(inputs.buildNumber)) : 'lastBuild';
          output = await jenkinsRequest(`${baseUrl}/${path}/${buildRef}/api/json`, { headers: authHeaders }, true);
        } else if (operation === 'cancel') {
          const buildNumber = String(inputs.buildNumber || '').trim();
          if (!buildNumber) throw new Error('buildNumber is required for cancel');
          output = await jenkinsRequest(`${baseUrl}/${path}/${encodeURIComponent(buildNumber)}/stop`, { method: 'POST', headers: postHeaders });
        } else {
          throw new Error(`Unsupported Jenkins operation: ${operation}`);
        }

        return { success: true, output: { operation, jobName: name, data: output } };
      } catch (error: any) {
        return { success: false, error: { code: 'JENKINS_FAILED', message: error?.message || 'Jenkins operation failed' } };
      }
    },
  };
}
