// Scheduler Service
// Basic cron job execution for scheduled workflows

import { getSupabaseClient } from '../../core/database/supabase-compat';
import cron from 'node-cron';

interface ScheduledWorkflow {
  id: string;
  workflowId: string;
  schedule: string; // Cron expression
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

class SchedulerService {
  private supabase: any;
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private initialized: boolean = false;
  private lastNetworkError: number = 0; // Track last network error to avoid log spam
  private consecutiveErrors: number = 0; // Track consecutive errors for backoff
  private lastSuccessfulLoad: number = 0; // Track last successful load

  constructor() {
    // Don't initialize Supabase client in constructor
    // Initialize lazily when start() is called
  }

  /**
   * Initialize Supabase client (lazy initialization)
   */
  private initializeSupabase() {
    if (!this.initialized) {
      try {
        this.supabase = getSupabaseClient();
        this.initialized = true;
      } catch (error) {
        console.warn('⚠️  Scheduler: Supabase not configured. Scheduler will not start.');
        console.warn('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable scheduler.');
        return false;
      }
    }
    return this.initialized;
  }

  /**
   * Start scheduler service
   */
  async start() {
    // Check if Supabase is configured
    if (!this.initializeSupabase()) {
      console.log('⏭️  Scheduler service skipped (Supabase not configured)');
      return;
    }

    console.log('🕐 Starting scheduler service...');
    
    // Load all scheduled workflows
    await this.loadScheduledWorkflows();
    
    // Set up periodic check for new schedules (every minute)
    // Use exponential backoff if there are consecutive errors
    cron.schedule('* * * * *', async () => {
      // Skip if we've had too many consecutive errors (backoff)
      if (this.consecutiveErrors >= 5) {
        const backoffMinutes = Math.min(5, Math.pow(2, Math.floor(this.consecutiveErrors / 5)));
        const timeSinceLastError = Date.now() - this.lastNetworkError;
        if (timeSinceLastError < backoffMinutes * 60000) {
          return; // Still in backoff period
        }
        // Reset error count after backoff period
        this.consecutiveErrors = 0;
      }
      
      await this.loadScheduledWorkflows();
    });
    
    console.log('✅ Scheduler service started');
  }

  /**
   * Load and schedule all active workflows
   */
  private async loadScheduledWorkflows() {
    if (!this.initialized || !this.supabase) {
      return;
    }

    try {
      // Add timeout wrapper for Supabase requests
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 10000); // 10 second timeout
      });

      // First, try to check if schedule column exists by querying workflow metadata
      // If schedule column doesn't exist, gracefully skip scheduled workflows
      const queryPromise = this.supabase
        .from('workflows')
        .select('id, name, status')
        .eq('status', 'active');

      const { data: workflows, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

      if (error) {
        // Check if error is due to missing column
        if (error.code === '42703' || error.message?.includes('does not exist')) {
          // Schedule column doesn't exist - this is OK, just skip scheduled workflows
          // This happens when the database schema hasn't been migrated yet
          return;
        }
        
        // Check if it's an SSL/network error - don't spam logs
        const errorMessage = error.message?.toLowerCase() || '';
        const errorDetails = String(error.details || '').toLowerCase();
        const isNetworkError = errorMessage.includes('ssl') || 
                              errorMessage.includes('fetch failed') || 
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('err_ssl') ||
                              errorDetails.includes('ssl') ||
                              errorDetails.includes('tls_get_more_records');
        
        if (isNetworkError) {
          this.consecutiveErrors++;
          this.lastNetworkError = Date.now();
          
          // Only log network errors occasionally to avoid spam
          if (this.consecutiveErrors === 1 || this.consecutiveErrors % 10 === 0) {
            console.warn(`⚠️  Scheduler: Network/SSL error (${this.consecutiveErrors} consecutive). This may indicate a network/proxy issue.`);
          }
          return;
        }
        
        // Reset error count for non-network errors
        this.consecutiveErrors = 0;
        
        console.error('Error loading scheduled workflows:', error);
        return;
      }

      if (!workflows) return;

      // Try to get schedule column if it exists (optional)
      // Query workflows with schedule column separately to avoid errors
      const scheduleQueryPromise = this.supabase
        .from('workflows')
        .select('id, schedule')
        .eq('status', 'active')
        .not('schedule', 'is', null);

      const scheduleTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 10000);
      });

      let workflowsWithSchedule: any = null;
      let scheduleError: any = null;

      try {
        const result = await Promise.race([scheduleQueryPromise, scheduleTimeoutPromise]) as any;
        workflowsWithSchedule = result.data;
        scheduleError = result.error;
      } catch (timeoutError: any) {
        const errorMessage = timeoutError?.message?.toLowerCase() || '';
        if (errorMessage.includes('timeout') || errorMessage.includes('ssl') || errorMessage.includes('fetch')) {
          // Network/timeout error - silently skip
          return;
        }
        scheduleError = timeoutError;
      }

      // If schedule column doesn't exist, just return (no scheduled workflows)
      if (scheduleError && (scheduleError.code === '42703' || scheduleError.message?.includes('does not exist'))) {
        return; // No schedule column - skip scheduled workflows gracefully
      }

      // Merge schedule data if available
      const scheduleMap = new Map<string, string>();
      if (workflowsWithSchedule) {
        workflowsWithSchedule.forEach((w: any) => {
          if (w.schedule) {
            scheduleMap.set(w.id, w.schedule);
          }
        });
      }

      // Remove old jobs that are no longer active
      for (const [workflowId, job] of this.jobs.entries()) {
        const stillActive = workflows.some((w: any) => w.id === workflowId);
        if (!stillActive) {
          job.stop();
          this.jobs.delete(workflowId);
        }
      }

      // Add new jobs (only if schedule column exists and has values)
      for (const workflow of workflows) {
        const schedule = scheduleMap.get(workflow.id);
        if (!this.jobs.has(workflow.id) && schedule) {
          this.scheduleWorkflow(workflow.id, schedule);
        }
      }
      
      // Reset error count on successful load
      if (this.consecutiveErrors > 0) {
        this.consecutiveErrors = 0;
        this.lastSuccessfulLoad = Date.now();
      }
    } catch (error: any) {
      const errorMessage = error?.message?.toLowerCase() || '';
      const isNetworkError = errorMessage.includes('timeout') || 
                            errorMessage.includes('ssl') ||
                            errorMessage.includes('fetch');
      
      if (isNetworkError) {
        this.consecutiveErrors++;
        this.lastNetworkError = Date.now();
        // Only log occasionally
        if (this.consecutiveErrors === 1 || this.consecutiveErrors % 10 === 0) {
          console.warn(`⚠️  Scheduler: Network error (${this.consecutiveErrors} consecutive). Retrying with backoff...`);
        }
      } else {
        console.error('Error in scheduler:', error);
      }
    }
  }

  /**
   * Schedule a workflow
   */
  private scheduleWorkflow(workflowId: string, schedule: string) {
    try {
      const job = cron.schedule(schedule, async () => {
        await this.executeScheduledWorkflow(workflowId);
      });

      this.jobs.set(workflowId, job);
      console.log(`📅 Scheduled workflow ${workflowId} with schedule: ${schedule}`);
    } catch (error) {
      console.error(`Error scheduling workflow ${workflowId}:`, error);
    }
  }

  /**
   * Execute a scheduled workflow
   */
  private async executeScheduledWorkflow(workflowId: string) {
    try {
      console.log(`🚀 Executing scheduled workflow: ${workflowId}`);
      
      // Call execute-workflow endpoint
      const executeUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3001'}/api/execute-workflow`;
      
      const response = await fetch(executeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflowId,
          input: {
            trigger: 'schedule',
            scheduled_at: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to execute scheduled workflow ${workflowId}:`, errorText);
      } else {
        console.log(`✅ Successfully executed scheduled workflow: ${workflowId}`);
      }
    } catch (error) {
      console.error(`Error executing scheduled workflow ${workflowId}:`, error);
    }
  }

  /**
   * Stop scheduler service
   */
  stop() {
    for (const [workflowId, job] of this.jobs.entries()) {
      job.stop();
      this.jobs.delete(workflowId);
    }
    console.log('🛑 Scheduler service stopped');
  }
}

// Export singleton instance
export const schedulerService = new SchedulerService();
