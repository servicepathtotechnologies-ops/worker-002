import { getDbClient } from '../core/database/aws-db-client';
import { getDbPool } from '../core/database/db-pool';
import { config } from '../core/config';
import type { PoolClient } from 'pg';
import { geminiWalletService } from './ai/gemini-wallet-service';

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
    const freePlan = await this.getPlanByName('Free').catch(() => null);
    const workflowLimit = await this.getEffectiveWorkflowLimit(userId).catch(() => freePlan?.workflowLimit ?? 2);
    return {
      id: `free:${userId}`,
      userId,
      planId: freePlan?.id || 'free',
      planName: 'Free',
      status: 'active',
      workflowLimit,
      workflowsUsed: 0,
      startedAt: new Date(),
      autoRenew: false,
    };
  }

  private async getActualWorkflowCount(userId: string): Promise<number> {
    const client = await getDbPool().connect();
    try {
      const result = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM public.workflows
         WHERE user_id = $1
           AND COALESCE(setup_completed, true) = true
           AND COALESCE(quota_source, 'subscription') = 'subscription'`,
        [userId]
      );
      return Number(result.rows[0]?.count || 0);
    } finally {
      client.release();
    }
  }

  private async syncWorkflowCount(userId: string, count?: number): Promise<number> {
    const actualCount = count ?? await this.getActualWorkflowCount(userId);
    const client = await getDbPool().connect();
    try {
      await client.query(
        `
          UPDATE public.users
          SET workflow_count = $2, last_workflow_check = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
        [userId, actualCount]
      );
      return actualCount;
    } finally {
      client.release();
    }
  }

  private async getEffectiveWorkflowLimit(userId: string): Promise<number> {
    const client = await getDbPool().connect();
    try {
      const result = await client.query(
        `
          SELECT (COALESCE(fp.workflow_limit, 2) + COALESCE(u.workflow_quota_bonus, 0))::int AS workflow_limit
          FROM public.users u
          LEFT JOIN public.subscription_plans fp ON fp.name = 'Free' AND fp.is_active = true
          WHERE u.id = $1
          LIMIT 1
        `,
        [userId]
      );
      return Number(result.rows[0]?.workflow_limit || 2);
    } finally {
      client.release();
    }
  }

  private async addWorkflowCredits(client: PoolClient, userId: string, credits: number): Promise<void> {
    if (credits <= 0) return;
    await client.query(
      `
        UPDATE public.users
        SET workflow_quota_bonus = COALESCE(workflow_quota_bonus, 0) + $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [userId, credits]
    );
  }

  /**
   * Get all available subscription plans with caching
   */
  async getAvailablePlans(): Promise<SubscriptionPlan[]> {
    try {
      // Check cache first
      if (this.planCache.size > 0 && Date.now() < this.cacheExpiry) {
        return Array.from(this.planCache.values());
      }

      const db = getDbClient();
      const { data: plans, error } = await db
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
      const transformedPlans = plans.map((plan: any) => ({
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
      transformedPlans.forEach((plan: any) => {
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
      const db = getDbClient();
      
      // Use the database function to get subscription details
      const { data, error } = await db
        .rpc('get_user_subscription_details', { p_uid: userId });

      if (error) {
        console.error('[SubscriptionService] Failed to get user subscription:', error);
        throw new Error(`Failed to get user subscription: ${error.message}`);
      }

      let row = this.firstSubscriptionRow(data);

      if (!row) {
        // No subscription found, ensure Free subscription exists
        await this.ensureFreeSubscription(userId);
        
        // Retry after creating Free subscription
        const { data: retryData, error: retryError } = await db
          .rpc('get_user_subscription_details', { p_uid: userId });

        if (retryError) {
          console.warn('[SubscriptionService] Retry subscription lookup failed, using Free fallback:', retryError);
          return this.buildFreeSubscriptionFallback(userId);
        }

        row = this.firstSubscriptionRow(retryData);
        if (!row) {
          console.warn('[SubscriptionService] Subscription RPC returned no usable row, using Free fallback:', {
            userId,
            resultType: Array.isArray(retryData) ? 'array' : typeof retryData,
            rowCount: Array.isArray(retryData) ? retryData.length : undefined,
          });
          return this.buildFreeSubscriptionFallback(userId);
        }
      }

      const subscription = this.transformSubscriptionData(row);
      subscription.workflowLimit = await this.getEffectiveWorkflowLimit(userId).catch(() => subscription.workflowLimit || 2);
      return subscription;
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
      const db = getDbClient();
      
      const { data, error } = await db
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
    const client = await getDbPool().connect();
    try {
      // Validate plan exists
      const plan = await this.getPlanByName(planName);
      if (!plan) {
        return {
          success: false,
          error: `Invalid plan: ${planName}`,
          code: 'INVALID_PLAN'
        };
      }

      await client.query('BEGIN');

      if (paymentId) {
        const paymentResult = await client.query(
          `
            SELECT subscription_id
            FROM public.payments
            WHERE id = $1 AND user_id = $2
            FOR UPDATE
          `,
          [paymentId, userId]
        );
        const payment = paymentResult.rows[0] || null;
        if (payment?.subscription_id) {
          await client.query('COMMIT');
          const existingSubscription = await this.getUserSubscription(userId);
          return {
            success: true,
            subscription: existingSubscription || undefined,
          };
        }

        const creditedPaymentResult = await client.query(
          `
            SELECT subscription_id
            FROM public.subscription_history
            WHERE payment_id = $1 AND user_id = $2
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [paymentId, userId]
        );
        const creditedSubscriptionId = creditedPaymentResult.rows[0]?.subscription_id;
        if (creditedSubscriptionId) {
          await client.query(
            `
              UPDATE public.payments
              SET subscription_id = $1
              WHERE id = $2 AND user_id = $3
            `,
            [creditedSubscriptionId, paymentId, userId]
          );
          await client.query('COMMIT');
          const existingSubscription = await this.getUserSubscription(userId);
          return {
            success: true,
            subscription: existingSubscription || undefined,
          };
        }
      }

      const currentResult = await client.query(
        `
          SELECT s.id, s.plan_id, sp.name AS plan_name
          FROM public.subscriptions s
          JOIN public.subscription_plans sp ON sp.id = s.plan_id
          WHERE s.user_id = $1 AND s.status = 'active'
          ORDER BY s.started_at DESC
          LIMIT 1
          FOR UPDATE OF s
        `,
        [userId]
      );
      const current = currentResult.rows[0] || null;

      let subscriptionId: string;
      let historyAction: 'created' | 'upgraded' | 'renewed';
      const samePlanPurchase = current?.plan_id === plan.id;

      if (current && !samePlanPurchase) {
        await client.query(
          `
            UPDATE public.subscriptions
            SET status = 'cancelled', cancelled_at = NOW(), auto_renew = false
            WHERE id = $1
          `,
          [current.id]
        );
      }

      if (samePlanPurchase && current) {
        subscriptionId = current.id;
        historyAction = 'renewed';
      } else {
        const inserted = await client.query(
          `
            INSERT INTO public.subscriptions (user_id, plan_id, status, started_at, auto_renew)
            VALUES ($1, $2, 'active', NOW(), true)
            RETURNING id
          `,
          [userId, plan.id]
        );
        subscriptionId = inserted.rows[0].id;
        historyAction = current?.plan_id ? 'upgraded' : 'created';
      }

      await client.query(
        `
          INSERT INTO public.subscription_history (
            user_id, subscription_id, action, from_plan_id, to_plan_id, payment_id, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          userId,
          subscriptionId,
          historyAction,
          current?.plan_id || null,
          plan.id,
          paymentId || null,
          historyAction === 'renewed'
            ? `${plan.name} workflow quota renewed with ${plan.workflowLimit} additional workflows`
            : current?.plan_name
              ? `Subscription changed from ${current.plan_name} to ${plan.name}`
              : `Subscription created as ${plan.name}`,
        ]
      );

      if (plan.name !== 'Free' && paymentId) {
        await this.addWorkflowCredits(client, userId, plan.workflowLimit);
      }

      if (paymentId) {
        await client.query(
          `
            UPDATE public.payments
            SET subscription_id = $1
            WHERE id = $2 AND user_id = $3
          `,
          [subscriptionId, paymentId, userId]
        );
      }

      await client.query('COMMIT');

      const updatedSubscription = await this.getUserSubscription(userId);
      
      return {
        success: true,
        subscription: updatedSubscription || undefined
      };
    } catch (error: any) {
      try {
        await client.query('ROLLBACK');
      } catch { /* ignore rollback failures */ }
      console.error('[SubscriptionService] upgradeSubscription error:', error);
      return {
        success: false,
        error: error?.message || 'Failed to upgrade subscription',
        code: 'UPGRADE_ERROR'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Cancel user subscription
   */
  async cancelSubscription(userId: string, reason?: string): Promise<SubscriptionResult> {
    try {
      const db = getDbClient();
      
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
      const { error: updateError } = await db
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
      const workflowsUsed = await this.syncWorkflowCount(userId);
      const workflowLimit = await this.getEffectiveWorkflowLimit(userId).catch(() => subscription?.workflowLimit || 2);
      
      if (!subscription) {
        return {
          workflowsUsed,
          workflowLimit,
          remainingWorkflows: Math.max(0, workflowLimit - workflowsUsed),
          utilizationPercentage: Math.min(100, Math.round((workflowsUsed / workflowLimit) * 100))
        };
      }

      const remainingWorkflows = Math.max(0, workflowLimit - workflowsUsed);
      const utilizationPercentage = Math.min(
        100,
        Math.round((workflowsUsed / workflowLimit) * 100)
      );

      return {
        workflowsUsed,
        workflowLimit,
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
      if (await geminiWalletService.isActive(userId)) {
        return true;
      }
      const usage = await this.getSubscriptionUsage(userId);
      return usage.workflowsUsed < usage.workflowLimit;
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
      await this.syncWorkflowCount(userId);
      return true;
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
      await this.syncWorkflowCount(userId);
      return true;
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
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid subscription data returned from database');
    }
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
