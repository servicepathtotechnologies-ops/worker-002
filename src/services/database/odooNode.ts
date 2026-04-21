/**
 * Odoo Node Executor
 *
 * Supports operations:
 * - getRecords: Fetch records from an Odoo model
 * - createRecord: Create a new record in an Odoo model
 * - updateRecord: Update an existing record
 * - deleteRecord: Delete a record
 * - executeMethod: Call a custom method on a model
 *
 * Uses Odoo's JSON-RPC API (xmlrpc-compatible endpoint).
 */

import { NodeExecutionContext } from '../../core/types/node-definition';

interface OdooCredentials {
  url: string;
  db: string;
  username: string;
  password: string;
}

/**
 * Authenticate with Odoo and return the user ID (uid).
 */
async function authenticate(credentials: OdooCredentials): Promise<number> {
  const { url, db, username, password } = credentials;

  const response = await fetch(`${url}/web/dataset/call_kw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'res.users',
        method: 'authenticate',
        args: [db, username, password, {}],
        kwargs: {},
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Odoo authentication HTTP error: ${response.status}`);
  }

  const json: any = await response.json();

  if (json.error) {
    throw new Error(`Odoo authentication failed: ${json.error.data?.message ?? json.error.message}`);
  }

  const uid = json.result;
  if (!uid || typeof uid !== 'number') {
    throw new Error('Odoo authentication failed: invalid credentials or database');
  }

  return uid;
}

/**
 * Call an Odoo model method via JSON-RPC.
 */
async function callOdoo(
  credentials: OdooCredentials,
  uid: number,
  model: string,
  method: string,
  args: any[],
  kwargs: Record<string, any> = {}
): Promise<any> {
  const { url, db, password } = credentials;

  const response = await fetch(`${url}/web/dataset/call_kw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model,
        method,
        args,
        kwargs: {
          context: {},
          ...kwargs,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Odoo API HTTP error: ${response.status}`);
  }

  const json: any = await response.json();

  if (json.error) {
    throw new Error(`Odoo API error: ${json.error.data?.message ?? json.error.message}`);
  }

  return json.result;
}

/**
 * Run Odoo node
 */
export async function runOdooNode(context: NodeExecutionContext): Promise<any> {
  const { inputs } = context;

  const credentials: OdooCredentials = {
    url: (inputs.url ?? '').replace(/\/$/, ''),
    db: inputs.db,
    username: inputs.username,
    password: inputs.password,
  };

  if (!credentials.url) {
    return { success: false, error: { message: 'Odoo URL is required' } };
  }
  if (!credentials.db) {
    return { success: false, error: { message: 'Odoo database name is required' } };
  }
  if (!credentials.username) {
    return { success: false, error: { message: 'Odoo username is required' } };
  }
  if (!credentials.password) {
    return { success: false, error: { message: 'Odoo password is required' } };
  }

  const operation = inputs.operation ?? 'getRecords';
  const model = inputs.model;

  if (!model) {
    return { success: false, error: { message: 'Odoo model is required (e.g. res.partner)' } };
  }

  try {
    const uid = await authenticate(credentials);

    let data: any;

    switch (operation) {
      case 'getRecords': {
        const domain: any[] = inputs.domain ?? [];
        const fields: string[] = inputs.fields ?? [];
        const limit: number = inputs.limit ?? 100;
        const offset: number = inputs.offset ?? 0;

        data = await callOdoo(credentials, uid, model, 'search_read', [domain], {
          fields,
          limit,
          offset,
        });
        break;
      }

      case 'createRecord': {
        const values: Record<string, any> = inputs.values ?? {};
        data = await callOdoo(credentials, uid, model, 'create', [values]);
        break;
      }

      case 'updateRecord': {
        const recordId: number = inputs.recordId;
        const values: Record<string, any> = inputs.values ?? {};

        if (!recordId) {
          return { success: false, error: { message: 'recordId is required for updateRecord' } };
        }

        data = await callOdoo(credentials, uid, model, 'write', [[recordId], values]);
        break;
      }

      case 'deleteRecord': {
        const recordId: number = inputs.recordId;

        if (!recordId) {
          return { success: false, error: { message: 'recordId is required for deleteRecord' } };
        }

        data = await callOdoo(credentials, uid, model, 'unlink', [[recordId]]);
        break;
      }

      case 'executeMethod': {
        const method: string = inputs.method;
        const methodArgs: any[] = inputs.methodArgs ?? [];
        const methodKwargs: Record<string, any> = inputs.methodKwargs ?? {};

        if (!method) {
          return { success: false, error: { message: 'method is required for executeMethod' } };
        }

        data = await callOdoo(credentials, uid, model, method, methodArgs, methodKwargs);
        break;
      }

      default:
        return { success: false, error: { message: `Unknown operation: ${operation}` } };
    }

    return {
      success: true,
      operation,
      model,
      data,
      error: null,
    };
  } catch (err: any) {
    return {
      success: false,
      operation,
      model,
      data: null,
      error: { message: err.message ?? 'Odoo operation failed' },
    };
  }
}
