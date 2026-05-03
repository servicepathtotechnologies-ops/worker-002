import { credentialExecutionAuthMiddleware, CredentialAuthRequest } from '../execution-auth-middleware';
import { connectionService } from '../connection-service';

jest.mock('../connection-service', () => ({
  connectionService: {
    getDecryptedConnection: jest.fn(),
  },
}));

describe('credentialExecutionAuthMiddleware', () => {
  function response() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  }

  it('fails closed when no authenticated user is available', async () => {
    const req = { body: { connectionId: 'conn-1' } } as CredentialAuthRequest;
    const res = response();
    const next = jest.fn();

    await credentialExecutionAuthMiddleware()(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches credentialAuth helpers after ownership validation', async () => {
    (connectionService.getDecryptedConnection as jest.Mock).mockResolvedValueOnce({});
    const req = {
      user: { id: 'user-1' },
      body: { connectionId: 'conn-1', workflowId: 'wf-1', nodeId: 'node-1', nodeType: 'http_request' },
    } as unknown as CredentialAuthRequest;
    const res = response();
    const next = jest.fn();

    await credentialExecutionAuthMiddleware()(req, res as any, next);

    expect(connectionService.getDecryptedConnection).toHaveBeenCalledWith('user-1', 'conn-1');
    expect(req.credentialAuth?.context).toMatchObject({
      userId: 'user-1',
      workflowId: 'wf-1',
      nodeId: 'node-1',
      nodeType: 'http_request',
      connectionId: 'conn-1',
    });
    expect(next).toHaveBeenCalled();
  });
});
