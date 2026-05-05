import { getDbClient } from '../../core/database/supabase-compat';
import { getRedisClient } from '../../shared/redis-client';
import { getSubscriptionService, LimitCheckResult, EnforcementResult, UsageStats } from './subscription-service';

export interface WorkflowLimitConfig {
  enableCaching: boolean;
  cacheTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Workflow Limit Enforcement Service
 * Implements real-time limit checking with database fallback
 * Uses Redis caching for performance optimization
 * Provides atomic workflow count increment operations
 */
export class WorkflowLimitService {
  private supabase = getDbClient();
  private subscriptionService = getSubscriptionService();
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly LIMIT_CACHE_PREFIX = 'workflow:limit:';
  private readonly COUNT_CACHE_PREFIX = 'workflow:count:';

  private async getRedis() {
    return getRedisClient();
  }

  private config: WorkflowLimitConfig = {
    enableCaching: true,
    cacheTimeout: 300000, // 5 minutes
    maxRetries: 3,
    retryDelay: 1000 // 1 second
  };

  /**
   * Check if user can create more workflows with cache-first strategy
   */
  async checkLimit(userId: string): Promise<LimitCheckResult> {
    try {
      const redis = await this.getRedis();
      // Try Redis cache first for performance
      if (redis && this.config.enableCaching) {
        const cachedResult = await this.getCachedLimitCheck(userId);
        if (cachedResult) {
          return cachedResult;
        }
      }

      // Fallback to database with subscription service
      const limitCheck = await this.subscriptionService.checkLimit(userId);

      // Cache the result
      if (redis && this.config.enableCaching) {
        await this.cacheLimitCheck(userId, limitCheck);
      }

      return limitCheck;
    } catch (error: any) {
      console.error('[WorkflowLimitService] checkLimit error:', error);
      
      // Return safe default on error
      return {
        canCreate: false,
        currentCount: 0,
        limit: 2,
        planName: 'Free',
        upgradeRequired: true
      };
    }
  }

  /**
   * Enforce workflow creation limit with atomic operations
   */
  async enforceLimit(userId: string): Promise<EnforcementResult> {
    try {
      // Check current limit
      const limitCheck = await this.checkLimit(userId);

      if (!limitCheck.canCreate) {
        return this.generateUpgradePrompt(limitCheck);
      }

      // Attempt to increment workflow count atomically
      const incrementResult = await this.incrementWorkflowCountAtomic(userId);
      
      if (!incrementResult.success) {
        return {
          allowed: false,
          reason: incrementResult.reason || 'INCREMENT_FAILED'
        };
      }

      // Clear cache to reflect updated count
      await this.clearUserLimitCache(userId);

      return { allowed: true };
    } catch (error: any) {
      console.error('[WorkflowLimitService] enforceLimit error:', error);
      return {
        allowed: false,
        reason: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Update workflow limits when subscription changes
   */
  async updateLimits(userId: string, newPlan: { name: string; workflowLimit: number }): Promise<void> {
    try {
      // Clear all caches for this user
      await this.clearUserLimitCache(userId);

      const redis = await this.getRedis();
      // Update cached limit information
      if (redis && this.config.enableCaching) {
        const limitCacheKey = `${this.LIMIT_CACHE_PREFIX}${userId}`;
        const updatedLimit: LimitCheckResult = {
          canCreate: true,
          currentCount: 0,
          limit: newPlan.workflowLimit,
          planName: newPlan.name
        };

        await redis.setex(
          limitCacheKey,
          this.CACHE_TTL,
          JSON.stringify(updatedLimit)
        );
      }

      console.log(`[WorkflowLimitService] Updated limits for user ${userId} to ${newPlan.name} plan (${newPlan.workflowLimit} workflows)`);
    } catch (error: any) {
      console.error('[WorkflowLimitService] updateLimits error:', error);
      throw error;
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getUsageStats(userId: string): Promise<UsageStats> {
    try {
      return await this.subscriptionService.getUsageStats(userId);
    } catch (error: any) {
      console.error('[WorkflowLimitService] getUsageStats error:', error);
      throw error;
    }
  }

  /**
   * Decrement workflow count when workflow is deleted
   */
  async decrementWorkflowCount(userId: string): Promise<boolean> {
    try {
      const { data: success, error } = await this.supabase
        .rpc('decrement_workflow_count', { target_user_id: userId });

      if (error) {
        console.error('[WorkflowLimitService] decrementWorkflowCount database error:', error);
        return false;
      }

      // Clear cache to reflect updated count
      await this.clearUserLimitCache(userId);

      return success || false;
    } catch (error: any) {
      console.error('[WorkflowLimitService] decrementWorkflowCount error:', error);
      return false;
    }
  }

  /**
   * Get current workflow count for a user
   */
  async getCurrentWorkflowCount(userId: string): Promise<number> {
    try {
      const redis = await this.getRedis();
      // Try cache first
      if (redis && this.config.enableCaching) {
        const countCacheKey = `${this.COUNT_CACHE_PREFIX}${userId}`;
        const cachedCount = await redis.get(countCacheKey);
        if (cachedCount !== null) {
          return parseInt(cachedCount, 10);
        }
      }

      // Fallback to database
      const { data, error } = await this.supabase
        .from('users')
        .select('workflow_count')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[WorkflowLimitService] getCurrentWorkflowCount error:', error);
        return 0;
      }

      const count = data?.workflow_count || 0;

      // Cache the result
      if (redis && this.config.enableCaching) {
        const countCacheKey = `${this.COUNT_CACHE_PREFIX}${userId}`;
        await redis.setex(countCacheKey, this.CACHE_TTL, count.toString());
      }

      return count;
    } catch (error: any) {
      console.error('[WorkflowLimitService] getCurrentWorkflowCount error:', error);
      return 0;
    }
  }

  /**
   * Batch update workflow counts for multiple users
   */
  async batchUpdateWorkflowCounts(updates: Array<{ userId: string; increment: number }>): Promise<boolean> {
    try {
      // Process updates in batches to avoid overwhelming the database
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < updates.length; i += batchSize) {
        batches.push(updates.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const promises = batch.map(async ({ userId, increment }) => {
          if (increment > 0) {
            // Increment
            for (let i = 0; i < increment; i++) {
              await this.supabase.rpc('increment_workflow_count', { target_user_id: userId });
            }
          } else if (increment < 0) {
            // Decrement
            for (let i = 0; i < Math.abs(increment); i++) {
              await this.supabase.rpc('decrement_workflow_count', { target_user_id: userId });
            }
          }
          
          // Clear cache for this user
          await this.clearUserLimitCache(userId);
        });

        await Promise.all(promises);
      }

      return true;
    } catch (error: any) {
      console.error('[WorkflowLimitService] batchUpdateWorkflowCounts error:', error);
      return false;
    }
  }

  /**
   * Get cached limit check result
   */
  private async getCachedLimitCheck(userId: string): Promise<LimitCheckResult | null> {
    try {
      const redis = await this.getRedis();
      if (!redis) return null;

      const limitCacheKey = `${this.LIMIT_CACHE_PREFIX}${userId}`;
      const cached = await redis.get(limitCacheKey);
      if (cached) return JSON.parse(cached);
      return null;
    } catch (error: any) {
      console.error('[WorkflowLimitService] getCachedLimitCheck error:', error);
      return null;
    }
  }

  /**
   * Cache limit check result
   */
  private async cacheLimitCheck(userId: string, result: LimitCheckResult): Promise<void> {
    try {
      const redis = await this.getRedis();
      if (!redis) return;

      const limitCacheKey = `${this.LIMIT_CACHE_PREFIX}${userId}`;
      await redis.setex(limitCacheKey, this.CACHE_TTL, JSON.stringify(result));
    } catch (error: any) {
      console.error('[WorkflowLimitService] cacheLimitCheck error:', error);
    }
  }

  /**
   * Increment workflow count atomically with retries
   */
  private async incrementWorkflowCountAtomic(userId: string): Promise<{ success: boolean; reason?: string }> {
    let lastError: any = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const { data: success, error } = await this.supabase
          .rpc('increment_workflow_count', { target_user_id: userId });

        if (error) {
          lastError = error;
          console.warn(`[WorkflowLimitService] Increment attempt ${attempt} failed:`, error);
          
          if (attempt < this.config.maxRetries) {
            await this.delay(this.config.retryDelay * attempt);
            continue;
          }
        }

        if (success) {
          return { success: true };
        } else {
          return { success: false, reason: 'LIMIT_EXCEEDED' };
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`[WorkflowLimitService] Increment attempt ${attempt} error:`, error);
        
        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelay * attempt);
          continue;
        }
      }
    }

    return { 
      success: false, 
      reason: 'MAX_RETRIES_EXCEEDED',
    };
  }

  /**
   * Generate upgrade prompt for limit exceeded scenarios
   */
  private generateUpgradePrompt(limitCheck: LimitCheckResult): EnforcementResult {
    const suggestedPlan = this.getSuggestedUpgradePlan(limitCheck.planName);
    
    return {
      allowed: false,
      reason: 'LIMIT_EXCEEDED',
      upgradePrompt: {
        message: `You've reached your ${limitCheck.planName} plan limit of ${limitCheck.limit} workflows. Upgrade to ${suggestedPlan} for more workflows.`,
        suggestedPlan,
        upgradeUrl: '/subscriptions'
      }
    };
  }

  /**
   * Get suggested upgrade plan based on current plan
   */
  private getSuggestedUpgradePlan(currentPlan: string): string {
    switch (currentPlan) {
      case 'Free':
        return 'Pro';
      case 'Pro':
        return 'Enterprise';
      default:
        return 'Pro';
    }
  }

  /**
   * Clear all cached data for a user
   */
  private async clearUserLimitCache(userId: string): Promise<void> {
    const redis = await this.getRedis();
    if (!redis) return;

    try {
      const keys = [
        `${this.LIMIT_CACHE_PREFIX}${userId}`,
        `${this.COUNT_CACHE_PREFIX}${userId}`
      ];
      await Promise.all(keys.map(key => redis.del(key)));
    } catch (error: any) {
      console.error('[WorkflowLimitService] clearUserLimitCache error:', error);
    }
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update service configuration
   */
  updateConfig(newConfig: Partial<WorkflowLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current service configuration
   */
  getConfig(): WorkflowLimitConfig {
    return { ...this.config };
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const details: any = {
        database: false,
        redis: false,
        subscriptionService: false
      };

      // Test database connection
      try {
        const { error } = await this.supabase.from('subscription_plans').select('id').limit(1);
        details.database = !error;
      } catch (error) {
        details.database = false;
      }

      // Test Redis connection
      if (this.getRedis) {
        try {
          const redis = await this.getRedis();
          if (redis) {
            await redis.ping();
            details.redis = true;
          } else {
            details.redis = 'not_configured';
          }
        } catch (error) {
          details.redis = false;
        }
      } else {
        details.redis = 'not_configured';
      }

      // Test subscription service
      try {
        await this.subscriptionService.getAvailablePlans();
        details.subscriptionService = true;
      } catch (error) {
        details.subscriptionService = false;
      }

      const healthy = details.database && details.subscriptionService;

      return { healthy, details };
    } catch (error: any) {
      return {
        healthy: false,
        details: { error: error.message }
      };
    }
  }
}

// Singleton instance
let workflowLimitServiceInstance: WorkflowLimitService | null = null;

export function getWorkflowLimitService(): WorkflowLimitService {
  if (!workflowLimitServiceInstance) {
    workflowLimitServiceInstance = new WorkflowLimitService();
  }
  return workflowLimitServiceInstance;
}