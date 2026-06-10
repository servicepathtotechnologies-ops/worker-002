/**
 * Unit tests for email-service.ts
 * SES client is mocked — no real AWS calls.
 */

// Must mock before importing the module under test
const mockSend = jest.fn().mockResolvedValue({ MessageId: 'msg-123' });
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn().mockImplementation((input) => ({ _input: input })),
}));

jest.mock('../../../core/database/aws-db-client', () => ({
  getDbClient: jest.fn().mockReturnValue({
    getUserById: jest.fn().mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null,
    }),
  }),
}));

import {
  sendExecutionCompleted,
  sendExecutionFailed,
  sendWelcomeEmail,
  _resetSesClient,
} from '../email-service';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getDbClient } from '../../../core/database/aws-db-client';

describe('email-service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      SES_FROM_EMAIL: 'noreply@ctrlchecks.ai',
      SES_REGION: 'us-east-1',
      EXECUTION_EMAIL_NOTIFICATIONS: 'true',
    };
    (SESClient as jest.Mock).mockImplementation(() => ({ send: mockSend }));
    // Reset cached SES client so the next getSesClient() call re-creates it with the mock.
    _resetSesClient();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('sendExecutionCompleted', () => {
    it('resolves user email and calls SES with correct subject', async () => {
      await sendExecutionCompleted('user-1', 'My Workflow', 'exec-abc');

      expect(getDbClient().getUserById).toHaveBeenCalledWith('user-1');
      expect(SendEmailCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Destination: { ToAddresses: ['user@example.com'] },
          Source: 'noreply@ctrlchecks.ai',
          Message: expect.objectContaining({
            Subject: expect.objectContaining({ Data: expect.stringContaining('My Workflow') }),
          }),
        })
      );
    });

    it('is a no-op when EXECUTION_EMAIL_NOTIFICATIONS is not true', async () => {
      process.env.EXECUTION_EMAIL_NOTIFICATIONS = 'false';
      await sendExecutionCompleted('user-1', 'WF', 'exec-1');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('is a no-op when SES_FROM_EMAIL is missing', async () => {
      delete process.env.SES_FROM_EMAIL;
      await sendExecutionCompleted('user-1', 'WF', 'exec-1');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('is a no-op when user has no email in DB', async () => {
      (getDbClient().getUserById as jest.Mock).mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });
      await sendExecutionCompleted('user-1', 'WF', 'exec-1');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('does not throw when SES rejects', async () => {
      mockSend.mockRejectedValueOnce(new Error('SES throttled'));
      await expect(
        sendExecutionCompleted('user-1', 'WF', 'exec-1')
      ).resolves.toBeUndefined();
    });

    it('escapes HTML in workflowName and executionId', async () => {
      await sendExecutionCompleted('user-1', '<script>alert(1)</script>', '<bad>');
      expect(SendEmailCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Message: expect.objectContaining({
            Body: expect.objectContaining({
              Html: expect.objectContaining({
                Data: expect.not.stringContaining('<script>'),
              }),
            }),
          }),
        })
      );
    });
  });

  describe('sendExecutionFailed', () => {
    it('sends failure email with error text', async () => {
      await sendExecutionFailed('user-1', 'My Workflow', 'Node timeout');

      expect(SendEmailCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Message: expect.objectContaining({
            Subject: expect.objectContaining({ Data: expect.stringContaining('failed') }),
            Body: expect.objectContaining({
              Html: expect.objectContaining({
                Data: expect.stringContaining('Node timeout'),
              }),
            }),
          }),
        })
      );
    });

    it('truncates error to 500 chars', async () => {
      const longError = 'x'.repeat(600);
      await sendExecutionFailed('user-1', 'WF', longError);
      const call = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
      const html: string = call.Message.Body.Html.Data;
      expect(html).toContain('x'.repeat(500));
      expect(html).not.toContain('x'.repeat(501));
    });

    it('escapes HTML in error message', async () => {
      await sendExecutionFailed('user-1', 'WF', '<img src=x onerror=alert(1)>');
      const call = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
      expect(call.Message.Body.Html.Data).not.toContain('<img');
    });

    it('is a no-op when notifications disabled', async () => {
      process.env.EXECUTION_EMAIL_NOTIFICATIONS = 'false';
      await sendExecutionFailed('user-1', 'WF', 'err');
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('sendWelcomeEmail', () => {
    it('sends welcome email with name and target address', async () => {
      await sendWelcomeEmail('new@example.com', 'Alice');
      expect(SendEmailCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Destination: { ToAddresses: ['new@example.com'] },
          Message: expect.objectContaining({
            Body: expect.objectContaining({
              Html: expect.objectContaining({
                Data: expect.stringContaining('Alice'),
              }),
            }),
          }),
        })
      );
    });

    it('does not require EXECUTION_EMAIL_NOTIFICATIONS flag', async () => {
      process.env.EXECUTION_EMAIL_NOTIFICATIONS = 'false';
      await sendWelcomeEmail('new@example.com', 'Bob');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when SES_FROM_EMAIL missing', async () => {
      delete process.env.SES_FROM_EMAIL;
      await sendWelcomeEmail('new@example.com', 'Bob');
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
