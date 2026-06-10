import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Mock subscription-auth before importing the service ─────────────────────

const mockCleanupExpiredSessions = jest.fn<() => Promise<number>>();

jest.mock('../../core/middleware/subscription-auth', () => ({
  cleanupExpiredSessions: mockCleanupExpiredSessions,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { sessionCleanupService } from '../session-cleanup';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SessionCleanupService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCleanupExpiredSessions.mockReset();
    mockCleanupExpiredSessions.mockResolvedValue(0);
  });

  afterEach(() => {
    sessionCleanupService.stop();
    jest.useRealTimers();
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns running=false before start', () => {
      const status = sessionCleanupService.getStatus();
      expect(status.running).toBe(false);
      expect(status.nextCleanup).toBeUndefined();
    });

    it('returns running=true after start', () => {
      sessionCleanupService.start();
      const status = sessionCleanupService.getStatus();
      expect(status.running).toBe(true);
    });

    it('includes a nextCleanup Date when running', () => {
      sessionCleanupService.start();
      const { nextCleanup } = sessionCleanupService.getStatus();
      expect(nextCleanup).toBeInstanceOf(Date);
      expect((nextCleanup as Date).getTime()).toBeGreaterThan(Date.now());
    });

    it('returns running=false after stop', () => {
      sessionCleanupService.start();
      sessionCleanupService.stop();
      expect(sessionCleanupService.getStatus().running).toBe(false);
    });

    it('nextCleanup is undefined after stop', () => {
      sessionCleanupService.start();
      sessionCleanupService.stop();
      expect(sessionCleanupService.getStatus().nextCleanup).toBeUndefined();
    });
  });

  // ── start ──────────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('calls cleanupExpiredSessions immediately on start', async () => {
      sessionCleanupService.start();
      await flushMicrotasks();
      expect(mockCleanupExpiredSessions).toHaveBeenCalledTimes(1);
    });

    it('warns and does not double-start when already running', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      sessionCleanupService.start();
      sessionCleanupService.start();
      expect(warnSpy).toHaveBeenCalledWith('[SessionCleanup] Service already running');
      warnSpy.mockRestore();
    });

    it('does not call cleanup a second time when start() is called twice', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      sessionCleanupService.start();
      sessionCleanupService.start();
      await flushMicrotasks();
      // Only the initial cleanup from the first start() should have fired
      expect(mockCleanupExpiredSessions).toHaveBeenCalledTimes(1);
      jest.restoreAllMocks();
    });

    it('fires cleanup again after one interval (1 hour)', async () => {
      sessionCleanupService.start();
      await flushMicrotasks();

      jest.advanceTimersByTime(60 * 60 * 1000);
      await flushMicrotasks();

      expect(mockCleanupExpiredSessions).toHaveBeenCalledTimes(2);
    });

    it('fires cleanup on every subsequent interval', async () => {
      sessionCleanupService.start();
      await flushMicrotasks();

      for (let i = 1; i <= 3; i++) {
        jest.advanceTimersByTime(60 * 60 * 1000);
        await flushMicrotasks();
      }

      expect(mockCleanupExpiredSessions).toHaveBeenCalledTimes(4); // initial + 3 intervals
    });
  });

  // ── stop ───────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    it('is safe to call when service is not running', () => {
      expect(() => sessionCleanupService.stop()).not.toThrow();
    });

    it('prevents further interval callbacks after stop', async () => {
      sessionCleanupService.start();
      await flushMicrotasks();

      sessionCleanupService.stop();
      const countAfterStop = mockCleanupExpiredSessions.mock.calls.length;

      jest.advanceTimersByTime(60 * 60 * 1000);
      await flushMicrotasks();

      expect(mockCleanupExpiredSessions).toHaveBeenCalledTimes(countAfterStop);
    });

    it('allows restart after stop', async () => {
      sessionCleanupService.start();
      await flushMicrotasks();
      sessionCleanupService.stop();

      mockCleanupExpiredSessions.mockClear();
      sessionCleanupService.start();
      await flushMicrotasks();

      expect(mockCleanupExpiredSessions).toHaveBeenCalledTimes(1);
    });
  });

  // ── runCleanup (via start) ─────────────────────────────────────────────────

  describe('runCleanup() behaviour (exercised via start)', () => {
    it('logs cleaned count when sessions were removed', async () => {
      mockCleanupExpiredSessions.mockResolvedValue(7);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      sessionCleanupService.start();
      await flushMicrotasks();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('7 expired sessions'),
      );
      logSpy.mockRestore();
    });

    it('does not log cleaned count when zero sessions removed', async () => {
      mockCleanupExpiredSessions.mockResolvedValue(0);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      sessionCleanupService.start();
      await flushMicrotasks();

      const cleanupLogs = logSpy.mock.calls.filter((args) =>
        String(args[0]).includes('expired sessions'),
      );
      expect(cleanupLogs).toHaveLength(0);
      logSpy.mockRestore();
    });

    it('logs error and does not throw when cleanupExpiredSessions rejects', async () => {
      mockCleanupExpiredSessions.mockRejectedValue(new Error('DB failure'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      sessionCleanupService.start();
      await flushMicrotasks();

      expect(errorSpy).toHaveBeenCalledWith(
        '[SessionCleanup] Error during cleanup:',
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });

    it('service remains running after a cleanup error', async () => {
      mockCleanupExpiredSessions.mockRejectedValue(new Error('DB failure'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      sessionCleanupService.start();
      await flushMicrotasks();

      expect(sessionCleanupService.getStatus().running).toBe(true);
      jest.restoreAllMocks();
    });
  });
});
