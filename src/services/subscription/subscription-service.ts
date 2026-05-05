import { getDbClient } from '../../core/database/supabase-compat';
import { getRedisClient } from '../../shared/redis-client';
import { config } from '../../core/config';

export interface SubscriptionPlan {
  id: string;
  name: 'Free' | 'Pro' | 'Enterprise';
  workflowLimit: number;
  price: number;
  originalPrice: number;
  currency: string;
  features: string[];
  isActive: boolean;
  developmentMode: boolean;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  workflowLimit: number;
  workflowsUsed: number;
  features: string[];
  startedAt: Date;
  expiresAt?: Date;
  cancelledAt?: Date;
  autoRenew: boolean;
}

export interface SubscriptionResult {
  success: boolean;
  subscription?: UserSubscription;
  error?: string;
  upgradeRequired?: boolean;
}

export interface UsageStats {
  workflowsUsed: number;
  workflowLimit: number;
  remainingWorkflows: number;
  utilizationPercentage: number;
}

export interface LimitCheckResult {
  canCreate: boolean;
  currentCount: number;
  limit: number;
  planName: string;
  upgradeRequired?: boolean;
}

export interface EnforcementResult {
  allowed: boolean;
  reason?: string;
  upgradePrompt?: {
    message: string;
    suggestedPlan: string;
    upgradeUrl: string;
  };
}

/**
 * Comprehensive subscription service with plan management functionality
 * Implements subscription plan retrieval with caching for performance
 * Provides user subscription lifecycle management (create, upgrade, downgrade, cancel)
 * Integrates with database functions from Task 1
 */
export class SubscriptionService {
  private supabase = getDbClient();
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly PLANS_CACHE_KEY = 'subscription:plans';
  private readonly USER_SUBSCRIPTION_CACHE_PREFIX = 'subscription:user:';

  private async getRedis() {
    return getRedisClient();
  }

  private firstSubscriptionRow(data: any): any | null {
    if (Array.isArray(data)) {
      return data.find((row) => row && typeof row === 'object' && row.subscription_id) || null;
    }
    if (data && typeof data === 'object' && data.subscription_id) {
      return data;
    }
    return null;
  }

  private async buildFreeSubscriptionFallback(userId: string): Promise<UserSubscription> {
    const plans = await this.getAvailablePlans().catch(() => []);
    const freePlan = plans.find((plan) => plan.name === 'Free');
    return {
      id: `free:${userId}`,
      userId,
      planId: freePlan?.id || 'free',
      planName: 'Free',
      status: 'active',
      workflowLimit: freePlan?.workflowLimit ?? 2,
      workflowsUsed: 0,
      features: freePlan?.features || [],
      startedAt: new Date(),
      autoRenew: false,
    };
  }

  /**
   * Get all available subscription plans with caching
   */
  async getAvailablePlans(): Promise<SubscriptionPlan[]> {
    try {
      // Try cache first
      const redis = await this.getRedis();
      if (redis) {
        const cached = await redis.get(this.PLANS_CACHE_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Fetch from database
      const { data: plans, error } = await this.supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('workflow_limit', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch subscription plans: ${error.message}`);
      }

      // Transform to service format
      const transformedPlans: SubscriptionPlan[] = (plans || []).map((plan: any) => ({
        id: plan.id,
        name: plan.name as 'Free' | 'Pro' | 'Enterprise',
        workflowLimit: plan.workflow_limit,
        price: config.developmentPricing ? 100 : plan.price_inr, // ₹1 for development
        originalPrice: plan.price_inr,
        currency: 'INR',
        features: Array.isArray(plan.features) ? plan.features : [],
        isActive: plan.is_active,
        developmentMode: config.developmentPricing
      }));

      // Cache the result
      if (redis) {
        await redis.setex(
          this.PLANS_CACHE_KEY,
          this.CACHE_TTL,
          JSON.stringify(transformedPlans)
        );
      }

      return transformedPlans;
    } catch (error: any) {
      console.error('[SubscriptionService] getAvailablePlans error:', error);
      throw error;
    }
  }

  /**
   * Get user's current subscription with caching
   */
  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      const cacheKey = `${this.USER_SUBSCRIPTION_CACHE_PREFIX}${userId}`;
      const redis = await this.getRedis();

      // Try cache first
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const subscription = JSON.parse(cached);
          subscription.startedAt = new Date(subscription.startedAt);
          if (subscription.expiresAt) subscription.expiresAt = new Date(subscription.expiresAt);
          if (subscription.cancelledAt) subscription.cancelledAt = new Date(subscription.cancelledAt);
          return subscription;
        }
      }

      // Use database function to get subscription details
      const { data, error } = await this.supabase
        .rpc('get_user_subscription_details', { target_user_id: userId });

      if (error) {
        throw new Error(`Failed to get user subscription: ${error.message}`);
      }

      let subscriptionData = this.firstSubscriptionRow(data);

      if (!subscriptionData) {
        // Ensure user has a free subscription
        await this.supabase.rpc('ensure_free_subscription', { target_user_id: userId });
        
        // Retry getting subscription details
        const { data: retryData, error: retryError } = await this.supabase
          .rpc('get_user_subscription_details', { target_user_id: userId });

        if (retryError) {
          console.warn('[SubscriptionService] Retry subscription lookup failed, using Free fallback:', retryError);
          return this.buildFreeSubscriptionFallback(userId);
        }

        subscriptionData = this.firstSubscriptionRow(retryData);
        if (!subscriptionData) {
          console.warn('[SubscriptionService] Subscription RPC returned no usable row, using Free fallback:', {
            userId,
            resultType: Array.isArray(retryData) ? 'array' : typeof retryData,
            rowCount: Array.isArray(retryData) ? retryData.length : undefined,
          });
          return this.buildFreeSubscriptionFallback(userId);
        }

        const subscription = this.transformSubscriptionData(subscriptionData, userId);
        
        // Cache the result
        if (redis) {
          await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(subscription));
        }

        return subscription;
      }

      const subscription = this.transformSubscriptionData(subscriptionData, userId);

      // Cache the result
      if (redis) {
        await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(subscription));
      }

      return subscription;
    } catch (error: any) {
      console.error('[SubscriptionService] getUserSubscription error:', error);
      throw error;
    }
  }

  /**
   * Upgrade user subscription to a new plan
   */
  async upgradeSubscription(userId: string, planId: string, paymentId?: string): Promise<SubscriptionResult> {
    try {
      // Get plan details
      const plans = await this.getAvailablePlans();
      const targetPlan = plans.find(p => p.id === planId);
      
      if (!targetPlan) {
        return {
          success: false,
          error: 'Invalid plan selected'
        };
      }

      // Use database function to upgrade subscription
      const { data: subscriptionId, error } = await this.supabase
        .rpc('upgrade_subscription', {
          target_user_id: userId,
          new_plan_name: targetPlan.name,
          payment_id: paymentId || null
        });

      if (error) {
        throw new Error(`Failed to upgrade subscription: ${error.message}`);
      }

      // Clear cache
      await this.clearUserSubscriptionCache(userId);

      // Get updated subscription
      const updatedSubscription = await this.getUserSubscription(userId);

      return {
        success: true,
        subscription: updatedSubscription || undefined
      };
    } catch (error: any) {
      console.error('[SubscriptionService] upgradeSubscription error:', error);
      return {
        success: false,
        error: error.message || 'Failed to upgrade subscription'
      };
    }
  }

  /**
   * Downgrade user subscription to a lower plan
   */
  async downgradeSubscription(userId: string, planId: string): Promise<SubscriptionResult> {
    try {
      // Get current subscription
      const currentSubscription = await this.getUserSubscription(userId);
      if (!currentSubscription) {
        return {
          success: false,
          error: 'No active subscription found'
        };
      }

      // Get plan details
      const plans = await this.getAvailablePlans();
      const targetPlan = plans.find(p => p.id === planId);
      const currentPlan = plans.find(p => p.name === currentSubscription.planName);
      
      if (!targetPlan || !currentPlan) {
        return {
          success: false,
          error: 'Invalid plan selected'
        };
      }

      // Prevent upgrade via downgrade function
      if (targetPlan.workflowLimit > currentPlan.workflowLimit) {
        return {
          success: false,
          error: 'Use upgradeSubscription for plan upgrades'
        };
      }

      // Check if user's current workflow count exceeds new plan limit
      if (currentSubscription.workflowsUsed > targetPlan.workflowLimit) {
        return {
          success: false,
          error: `Cannot downgrade: You have ${currentSubscription.workflowsUsed} workflows but ${targetPlan.name} plan allows only ${targetPlan.workflowLimit}. Please delete some workflows first.`
        };
      }

      // Use upgrade function (it handles downgrades too)
      return await this.upgradeSubscription(userId, planId);
    } catch (error: any) {
      console.error('[SubscriptionService] downgradeSubscription error:', error);
      return {
        success: false,
        error: error.message || 'Failed to downgrade subscription'
      };
    }
  }

  /**
   * Cancel user subscription
   */
  async cancelSubscription(userId: string): Promise<SubscriptionResult> {
    try {
      const currentSubscription = await this.getUserSubscription(userId);
      if (!currentSubscription) {
        return {
          success: false,
          error: 'No active subscription found'
        };
      }

      // Don't cancel Free plan
      if (currentSubscription.planName === 'Free') {
        return {
          success: false,
          error: 'Cannot cancel Free plan'
        };
      }

      // Update subscription status to cancelled
      const { error } = await this.supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          auto_renew: false
        })
        .eq('id', currentSubscription.id);

      if (error) {
        throw new Error(`Failed to cancel subscription: ${error.message}`);
      }

      // Log the cancellation
      await this.supabase
        .from('subscription_history')
        .insert({
          user_id: userId,
          subscription_id: currentSubscription.id,
          action: 'cancelled',
          from_plan_id: currentSubscription.planId,
          notes: 'User-initiated cancellation'
        });

      // Create Free subscription
      await this.supabase.rpc('ensure_free_subscription', { target_user_id: userId });

      // Clear cache
      await this.clearUserSubscriptionCache(userId);

      // Get updated subscription
      const updatedSubscription = await this.getUserSubscription(userId);

      return {
        success: true,
        subscription: updatedSubscription || undefined
      };
    } catch (error: any) {
      console.error('[SubscriptionService] cancelSubscription error:', error);
      return {
        success: false,
        error: error.message || 'Failed to cancel subscription'
      };
    }
  }

  /**
   * Handle subscription expiration
   */
  async handleExpiration(userId: string): Promise<void> {
    try {
      const currentSubscription = await this.getUserSubscription(userId);
      if (!currentSubscription) {
        return;
      }

      // Check if subscription is expired
      if (currentSubscription.expiresAt && new Date() > currentSubscription.expiresAt) {
        // Update subscription status to expired
        await this.supabase
          .from('subscriptions')
          .update({ status: 'expired' })
          .eq('id', currentSubscription.id);

        // Log the expiration
        await this.supabase
          .from('subscription_history')
          .insert({
            user_id: userId,
            subscription_id: currentSubscription.id,
            action: 'expired',
            from_plan_id: currentSubscription.planId,
            notes: 'Subscription expired automatically'
          });

        // Create Free subscription
        await this.supabase.rpc('ensure_free_subscription', { target_user_id: userId });

        // Clear cache
        await this.clearUserSubscriptionCache(userId);
      }
    } catch (error: any) {
      console.error('[SubscriptionService] handleExpiration error:', error);
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getUsageStats(userId: string): Promise<UsageStats> {
    try {
      const subscription = await this.getUserSubscription(userId);
      if (!subscription) {
        return {
          workflowsUsed: 0,
          workflowLimit: 2, // Default Free plan limit
          remainingWorkflows: 2,
          utilizationPercentage: 0
        };
      }

      return {
        workflowsUsed: subscription.workflowsUsed,
        workflowLimit: subscription.workflowLimit,
        remainingWorkflows: Math.max(0, subscription.workflowLimit - subscription.workflowsUsed),
        utilizationPercentage: Math.round((subscription.workflowsUsed / subscription.workflowLimit) * 100)
      };
    } catch (error: any) {
      console.error('[SubscriptionService] getUsageStats error:', error);
      throw error;
    }
  }

  /**
   * Check if user can create more workflows
   */
  async checkLimit(userId: string): Promise<LimitCheckResult> {
    try {
      const { data, error } = await this.supabase
        .rpc('check_workflow_limit', { target_user_id: userId });

      if (error) {
        throw new Error(`Failed to check workflow limit: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return {
          canCreate: false,
          currentCount: 0,
          limit: 2,
          planName: 'Free',
          upgradeRequired: true
        };
      }

      const result = data[0];
      return {
        canCreate: result.can_create,
        currentCount: result.current_count,
        limit: result.limit_count,
        planName: result.plan_name,
        upgradeRequired: !result.can_create
      };
    } catch (error: any) {
      console.error('[SubscriptionService] checkLimit error:', error);
      throw error;
    }
  }

  /**
   * Enforce workflow creation limit
   */
  async enforceLimit(userId: string): Promise<EnforcementResult> {
    try {
      const limitCheck = await this.checkLimit(userId);

      if (!limitCheck.canCreate) {
        const plans = await this.getAvailablePlans();
        const currentPlan = plans.find(p => p.name === limitCheck.planName);
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

      // Increment workflow count
      const { data: success, error } = await this.supabase
        .rpc('increment_workflow_count', { target_user_id: userId });

      if (error || !success) {
        return {
          allowed: false,
          reason: 'INCREMENT_FAILED'
        };
      }

      // Clear cache to reflect updated count
      await this.clearUserSubscriptionCache(userId);

      return { allowed: true };
    } catch (error: any) {
      console.error('[SubscriptionService] enforceLimit error:', error);
      return {
        allowed: false,
        reason: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Update workflow limits when subscription changes
   */
  async updateLimits(userId: string, newPlan: SubscriptionPlan): Promise<void> {
    try {
      // Clear user subscription cache to force refresh
      await this.clearUserSubscriptionCache(userId);

      // The database triggers will handle updating the user's subscription_id
      // and the workflow limits are enforced through the subscription plan
      console.log(`[SubscriptionService] Updated limits for user ${userId} to ${newPlan.name} plan (${newPlan.workflowLimit} workflows)`);
    } catch (error: any) {
      console.error('[SubscriptionService] updateLimits error:', error);
      throw error;
    }
  }

  /**
   * Clear user subscription cache
   */
  private async clearUserSubscriptionCache(userId: string): Promise<void> {
    const redis = await this.getRedis();
    if (redis) {
      const cacheKey = `${this.USER_SUBSCRIPTION_CACHE_PREFIX}${userId}`;
      await redis.del(cacheKey);
    }
  }

  /**
   * Transform database subscription data to service format
   */
  private transformSubscriptionData(data: any, userId: string): UserSubscription {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid subscription data returned from database');
    }
    return {
      id: data.subscription_id,
      userId,
      planId: data.subscription_id, // Using subscription_id as planId for now
      planName: data.plan_name,
      status: data.status,
      workflowLimit: data.workflow_limit,
      workflowsUsed: data.workflow_count || 0,
      features: [], // Will be populated from plan data if needed
      startedAt: new Date(data.started_at),
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
      cancelledAt: undefined, // Not provided by the function
      autoRenew: true // Default value
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
}

// Singleton instance
let subscriptionServiceInstance: SubscriptionService | null = null;

export function getSubscriptionService(): SubscriptionService {
  if (!subscriptionServiceInstance) {
    subscriptionServiceInstance = new SubscriptionService();
  }
  return subscriptionServiceInstance;
}
