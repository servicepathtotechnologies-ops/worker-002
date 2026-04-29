import { cleanupExpiredSessions } from '../core/middleware/subscription-auth';

/**
 * Session cleanup service
 * Runs periodically to clean up expired sessions
 */
class SessionCleanupService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly cleanupInterval = 60 * 60 * 1000; // 1 hour

  /**
   * Start the session cleanup service
   */
  start(): void {
    if (this.intervalId) {
      console.warn('[SessionCleanup] Service already running');
      return;
    }

    console.log('[SessionCleanup] Starting session cleanup service...');
    
    // Run initial cleanup
    void this.runCleanup();
    
    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      void this.runCleanup();
    }, this.cleanupInterval);

    console.log(`[SessionCleanup] Service started (runs every ${this.cleanupInterval / 1000 / 60} minutes)`);
  }

  /**
   * Stop the session cleanup service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[SessionCleanup] Service stopped');
    }
  }

  /**
   * Run session cleanup
   */
  private async runCleanup(): Promise<void> {
    try {
      const cleanedCount = await cleanupExpiredSessions();
      if (cleanedCount > 0) {
        console.log(`[SessionCleanup] Cleaned up ${cleanedCount} expired sessions`);
      }
    } catch (error) {
      console.error('[SessionCleanup] Error during cleanup:', error);
    }
  }

  /**
   * Get service status
   */
  getStatus(): { running: boolean; nextCleanup?: Date } {
    return {
      running: this.intervalId !== null,
      nextCleanup: this.intervalId ? new Date(Date.now() + this.cleanupInterval) : undefined
    };
  }
}

// Export singleton instance
export const sessionCleanupService = new SessionCleanupService();