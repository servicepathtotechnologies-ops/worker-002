import { NextFunction, Request, Response } from 'express';
import { authInjectionEngine } from './execution-auth';
import { connectionService } from './connection-service';
import type { RuntimeExecutionContext, RuntimeRequest } from './types';

export interface CredentialAuthRequest extends Request {
  credentialAuth?: {
    context: RuntimeExecutionContext;
    inject: (request: RuntimeRequest) => Promise<RuntimeRequest>;
    execute: (request: RuntimeRequest) => Promise<{ status: number; headers: Record<string, string>; data: unknown }>;
  };
}

function readUserId(req: Request): string | undefined {
  return (req as any).user?.id || req.body?.userId;
}

function readConnectionId(req: Request): string | undefined {
  return req.body?.connectionId || req.body?.node?.data?.config?.connectionId || req.body?.node?.data?.config?.credentialId;
}

export function credentialExecutionAuthMiddleware() {
  return async (req: CredentialAuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = readUserId(req);
      const connectionId = readConnectionId(req);

      if (!userId) {
        return res.status(401).json({ error: 'Authenticated user is required for credential execution' });
      }

      if (!connectionId) {
        return res.status(400).json({ error: 'connectionId is required for credential execution' });
      }

      await connectionService.getDecryptedConnection(userId, connectionId);

      const context: RuntimeExecutionContext = {
        userId,
        workflowId: req.body?.workflowId,
        nodeId: req.body?.nodeId || req.body?.node?.id || 'runtime-request',
        nodeType: req.body?.nodeType || req.body?.node?.type || req.body?.node?.data?.type || 'runtime-request',
        connectionId,
      };

      req.credentialAuth = {
        context,
        inject: (request) => authInjectionEngine.injectIntoRequest(context, request),
        execute: (request) => authInjectionEngine.executeNodeRequest(context, request),
      };

      return next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Credential authorization failed';
      return res.status(403).json({ error: message });
    }
  };
}
