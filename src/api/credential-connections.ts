import { Request, Response } from 'express';
import { connectionService } from '../credentials-system/connection-service';
import { authInjectionEngine } from '../credentials-system/execution-auth';
import type { CredentialAuthRequest } from '../credentials-system/execution-auth-middleware';
import { nodeRegistryService } from '../credentials-system/node-registry-service';
import { oauthService } from '../credentials-system/oauth-service';

function userId(req: Request): string {
  const id = (req as any).user?.id || req.query.user_id || req.body?.userId;
  if (!id || typeof id !== 'string') throw new Error('Authenticated user is required');
  return id;
}

export async function credentialTypesHandler(_req: Request, res: Response) {
  res.json({ credentialTypes: connectionService.listCredentialTypes() });
}

export async function registryNodesHandler(_req: Request, res: Response) {
  res.json({ nodes: nodeRegistryService.listNodeDefinitions() });
}

export async function listConnectionsHandler(req: Request, res: Response) {
  res.json({ connections: await connectionService.listConnections(userId(req)) });
}

export async function createConnectionHandler(req: Request, res: Response) {
  const connection = await connectionService.createConnection({
    userId: userId(req),
    name: req.body.name,
    credentialTypeId: req.body.credentialTypeId,
    credentials: req.body.credentials || {},
    metadata: req.body.metadata || {},
  });
  res.status(201).json({ connection });
}

export async function updateConnectionHandler(req: Request, res: Response) {
  const connection = await connectionService.updateConnection(userId(req), req.params.id, {
    name: req.body.name,
    credentials: req.body.credentials,
    metadata: req.body.metadata,
  });
  res.json({ connection });
}

export async function deleteConnectionHandler(req: Request, res: Response) {
  await connectionService.deleteConnection(userId(req), req.params.id);
  res.status(204).send();
}

export async function testConnectionHandler(req: Request, res: Response) {
  res.json(await connectionService.testConnection(userId(req), req.params.id));
}

export async function oauthStartHandler(req: Request, res: Response) {
  const result = await oauthService.start({
    userId: userId(req),
    credentialTypeId: String(req.query.credentialTypeId || req.body.credentialTypeId),
    connectionId: typeof req.query.connectionId === 'string' ? req.query.connectionId : req.body.connectionId,
    scopes: typeof req.query.scopes === 'string' ? req.query.scopes.split(',') : req.body.scopes,
    returnTo: typeof req.query.returnTo === 'string' ? req.query.returnTo : req.body.returnTo,
  });
  res.json(result);
}

export async function oauthCallbackHandler(req: Request, res: Response) {
  const code = String(req.query.code || req.body.code || '');
  const state = String(req.query.state || req.body.state || '');
  const result = await oauthService.callback({ code, state });
  if (req.method === 'GET') {
    // Return an HTML page that notifies the opener popup and closes itself
    return res.send(`<!DOCTYPE html><html><head><title>Connected</title></head><body>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth-success', connectionId: '${result.connectionId}' }, '*');
      window.close();
    } else {
      window.location.href = '${process.env.FRONTEND_URL || 'http://localhost:5173'}/connections?connected=${result.connectionId}';
    }
  } catch(e) {
    window.location.href = '${process.env.FRONTEND_URL || 'http://localhost:5173'}/connections';
  }
</script>
<p>Connected successfully! You can close this window.</p>
</body></html>`);
  }
  return res.json(result);
}

export async function oauthReconnectHandler(req: Request, res: Response) {
  const connection = await connectionService.getDecryptedConnection(userId(req), req.params.id);
  const result = await oauthService.start({
    userId: userId(req),
    credentialTypeId: connection.credentialTypeId,
    connectionId: connection.id,
    returnTo: req.body.returnTo,
  });
  res.json(result);
}

export async function executeAuthenticatedRequestHandler(req: Request, res: Response) {
  const credentialReq = req as CredentialAuthRequest;
  if (credentialReq.credentialAuth) {
    return res.json(await credentialReq.credentialAuth.execute(req.body.request));
  }

  const result = await authInjectionEngine.executeNodeRequest(
    {
      userId: userId(req),
      workflowId: req.body.workflowId,
      nodeId: req.body.nodeId,
      nodeType: req.body.nodeType,
      connectionId: req.body.connectionId,
    },
    req.body.request,
  );
  res.json(result);
}
