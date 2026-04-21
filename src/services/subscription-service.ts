import { getSupabaseClient } from '../core/database/supabase-compat';
import { config } from '../core/config';

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
  startedAt: Date;
  expiresAt?: Date;
  cancelledAt?: Date;
  autoRenew: boolean;
}

export interface SubscriptionUsage {
  workflowsUsed: number;
  workflowLimit: number;
  remainingWorkflows: number;
  utilizationPercentage: number;
}

export interface SubscriptionResult {
  success: boolean;
  subscription?: UserSubscription;
  error?: string;
  code?: string;
}

/**
 * Comprehensive subscription service with plan management
 */
export class SubscriptionService {
  private planCache: Map<string, SubscriptionPlan> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all available subscription plans with caching
   */
  async getAvailablePlans(): Promise<SubscriptionPlan[]> {
    try {
      // Check cache first
      if (this.planCache.size > 0 && Date.now() < this.cacheExpiry) {
        return Array.from(this.planCache.values());
      }

      const supabase = getSupabaseClient();
      const { data: plans, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('workflow_limit', { ascending: true });

      if (error) {
        console.error('[SubscriptionService] Failed to fetch plans:', error);
        throw new Error(`Failed to fetch subscription plans: ${error.message}`);
      }

      if (!plans || plans.length === 0) {
        throw new Error('No active subscription plans found');
      }

      // Transform and cache plans
      const transformedPlans = plans.map(plan => ({
        id: plan.id,
        name: plan.name as 'Free' | 'Pro' | 'Enterprise',
        workflowLimit: plan.workflow_limit,
        price: config.developmentPricing ? 
          (plan.name === 'Free' ? 0 : 100) : // ₹1 for testing
          plan.price_inr,
        originalPrice: plan.price_inr,
        currency: 'INR',
        features: plan.features || [],
        isActive: plan.is_active,
        developmentMode: config.developmentPricing
      }));

      // Update cache
      this.planCache.clear();
      transformedPlans.forEach(plan => {
        this.planCache.set(plan.id, plan);
      });
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      return transformedPlans;
    } catch (error: any) {
      console.error('[SubscriptionService] getAvailablePlans error:', error);
      throw error;
    }
  }

  /**
   * Get subscription plan by ID
   */
  async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
    try {
      const plans = await this.getAvailablePlans();
      return plans.find(plan => plan.id === planId) || null;
    } catch (error: any) {
      console.error('[SubscriptionService] getPlanById error:', error);
      return null;
    }
  }

  /**
   * Get subscription plan by name
   */
  async getPlanByName(planName: string): Promise<SubscriptionPlan | null> {
    try {
      const plans = await this.getAvailablePlans();
      return plans.find(plan => plan.name === planName) || null;
    } catch (error: any) {
      console.error('[SubscriptionService] getPlanByName error:', error);
      return null;
    }
  }

  /**
   * Get current user subscription with detailed information
   */
  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      const supabase = getSupabaseClient();
      
      // Use the database function to get subscription details
      const { data, error } = await supabase
        .rpc('get_user_subscription_details', { p_uid: userId });

      if (error) {
        console.error('[SubscriptionService] Failed to get user subscription:', error);
        throw new Error(`Failed to get user subscription: ${error.message}`);
      }

      if (!data || data.length === 0) {
        // No subscription found, ensure Free subscription exists
        await this.ensureFreeSubscription(userId);
        
        // Retry after creating Free subscription
        const { data: retryData, error: retryError } = await supabase
          .rpc('get_user_subscription_details', { p_uid: userId });

        if (retryError || !retryData || retryData.length === 0) {
          return null;
        }

        return this.transformSubscriptionData(retryData[0]);
      }

      return this.transformSubscriptionData(data[0]);
    } catch (error: any) {
      console.error('[SubscriptionService] getUserSubscription error:', error);
      throw error;
    }
  }

  /**
   * Ensure user has a Free subscription
   */
  async ensureFreeSubscription(userId: string): Promise<string> {
    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .rpc('ensure_free_subscription', { p_uid: userId });

      if (error) {
        console.error('[SubscriptionService] Failed to ensure free subscription:', error);
        throw new Error(`Failed to create free subscription: ${error.message}`);
      }

      return data;
    } catch (error: any) {
      console.error('[SubscriptionService] ensureFreeSubscription error:', error);
      throw error;
    }
  }

  /**
   * Upgrade user subscription to a new plan
   */
  async upgradeSubscription(
    userId: string, 
    planName: string, 
    paymentId?: string
  ): Promise<SubscriptionResult> {
    try {
      const supabase = getSupabaseClient();
      
      // Validate plan exists
      const plan = await this.getPlanByName(planName);
      if (!plan) {
        return {
          success: false,
          error: `Invalid plan: ${planName}`,
          code: 'INVALID_PLAN'
        };
      }

      // Use database function to upgrade subscription
      const { data, error } = await supabase
        .rpc('upgrade_subscription', {
          p_uid: userId,
          p_plan: planName,
          p_pay: paymentId || null
        });

      if (error) {
        console.error('[SubscriptionService] Failed to upgrade subscription:', error);
        return {
          success: false,
          error: `Failed to upgrade subscription: ${error.message}`,
          code: 'UPGRADE_FAILED'
        };
      }

      // Get updated subscription details
      const updatedSubscription = await this.getUserSubscription(userId);
      
      return {
        success: true,
        subscription: updatedSubscription || undefined
      };
    } catch (error: any) {
      console.error('[SubscriptionService] upgradeSubscription error:', error);
      return {
        success: false,
        error: error?.message || 'Failed to upgrade subscription',
        code: 'UPGRADE_ERROR'
      };
    }
  }

  /**
   * Cancel user subscription
   */
  async cancelSubscription(userId: string, reason?: string): Promise<SubscriptionResult> {
    try {
      const supabase = getSupabaseClient();
      
      // Get current subscription
      const currentSubscription = await this.getUserSubscription(userId);
      if (!currentSubscription) {
        return {
          success: false,
          error: 'No active subscription found',
          code: 'NO_SUBSCRIPTION'
        };
      }

      if (currentSubscription.planName === 'Free') {
        return {
          success: false,
          error: 'Cannot cancel Free plan',
          code: 'CANNOT_CANCEL_FREE'
        };
      }

      // Update subscription status to cancelled
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          auto_renew: false
        })
        .eq('id', currentSubscription.id)
        .eq('user_id', userId);

      if (updateError) {
        console.error('[SubscriptionService] Failed to cancel subscription:', updateError);
        return {
          success: false,
          error: `Failed to cancel subscription: ${updateError.message}`,
          code: 'CANCEL_FAILED'
        };
      }

      // Create Free subscription for the user
      await this.ensureFreeSubscription(userId);

      // Get updated subscription details
      const updatedSubscription = await this.getUserSubscription(userId);
      
      return {
        success: true,
        subscription: updatedSubscription || undefined
      };
    } catch (error: any) {
      console.error('[SubscriptionService] cancelSubscription error:', error);
      return {
        success: false,
        error: error?.message || 'Failed to cancel subscription',
        code: 'CANCEL_ERROR'
      };
    }
  }

  /**
   * Get subscription usage statistics
   */
  async getSubscriptionUsage(userId: string): Promise<SubscriptionUsage> {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      if (!subscription) {
        // Default to Free plan limits
        return {
          workflowsUsed: 0,
          workflowLimit: 2,
          remainingWorkflows: 2,
          utilizationPercentage: 0
        };
      }

      const remainingWorkflows = Math.max(0, subscription.workflowLimit - subscription.workflowsUsed);
      const utilizationPercentage = Math.round((subscription.workflowsUsed / subscription.workflowLimit) * 100);

      return {
        workflowsUsed: subscription.workflowsUsed,
        workflowLimit: subscription.workflowLimit,
        remainingWorkflows,
        utilizationPercentage
      };
    } catch (error: any) {
      console.error('[SubscriptionService] getSubscriptionUsage error:', error);
      // Return safe defaults on error
      return {
        workflowsUsed: 0,
        workflowLimit: 2,
        remainingWorkflows: 2,
        utilizationPercentage: 0
      };
    }
  }

  /**
   * Check if user can create more workflows
   */
  async canCreateWorkflow(userId: string): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .rpc('check_workflow_limit', { p_uid: userId });

      if (error) {
        console.error('[SubscriptionService] Failed to check workflow limit:', error);
        return false; // Fail safe
      }

      return data && data.length > 0 ? data[0].can_create : false;
    } catch (error: any) {
      console.error('[SubscriptionService] canCreateWorkflow error:', error);
      return false; // Fail safe
    }
  }

  /**
   * Increment user workflow count
   */
  async incrementWorkflowCount(userId: string): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .rpc('increment_workflow_count', { p_uid: userId });

      if (error) {
        console.error('[SubscriptionService] Failed to increment workflow count:', error);
        return false;
      }

      return data === true;
    } catch (error: any) {
      console.error('[SubscriptionService] incrementWorkflowCount error:', error);
      return false;
    }
  }

  /**
   * Decrement user workflow count
   */
  async decrementWorkflowCount(userId: string): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .rpc('decrement_workflow_count', { p_uid: userId });

      if (error) {
        console.error('[SubscriptionService] Failed to decrement workflow count:', error);
        return false;
      }

      return data === true;
    } catch (error: any) {
      console.error('[SubscriptionService] decrementWorkflowCount error:', error);
      return false;
    }
  }

  /**
   * Clear plan cache (useful for testing or when plans are updated)
   */
  clearCache(): void {
    this.planCache.clear();
    this.cacheExpiry = 0;
  }

  /**
   * Transform database subscription data to UserSubscription interface
   */
  private transformSubscriptionData(data: any): UserSubscription {
    return {
      id: data.subscription_id,
      userId: data.user_id || '',
      planId: data.plan_id || '',
      planName: data.plan_name,
      status: data.status,
      workflowLimit: data.workflow_limit,
      workflowsUsed: data.workflow_count || 0,
      startedAt: new Date(data.started_at),
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
      cancelledAt: data.cancelled_at ? new Date(data.cancelled_at) : undefined,
      autoRenew: data.auto_renew || false
    };
  }
}

// Export singleton instance
export const subscriptionService = new SubscriptionService();