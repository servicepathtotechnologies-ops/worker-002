import * as crypto from 'crypto';
import { getSupabaseClient } from '../../core/database/supabase-compat';
import { config } from '../../core/config';
import { getSubscriptionService } from './subscription-service';

export interface PaymentOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  keyId: string;
  user: {
    id: string;
    email: string;
  };
  plan: {
    id: string;
    name: string;
    amount: number;
    workflowLimit: number;
    features: string[];
  };
  developmentMode: boolean;
}

export interface PaymentVerification {
  success: boolean;
  verified: boolean;
  paymentId: string;
  orderId: string;
  signature: string;
  error?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  subscriptionId?: string;
  error?: string;
}

export interface RazorpayWebhook {
  event: string;
  payload: {
    payment?: {
      entity: any;
    };
    order?: {
      entity: any;
    };
  };
  created_at: number;
}

/**
 * Payment Service for Razorpay Integration
 * Handles payment order creation, verification, and webhook processing
 * Implements retry logic for failed payments and secure signature validation
 */
export class PaymentService {
  private supabase = getSupabaseClient();
  private subscriptionService = getSubscriptionService();

  private readonly PLAN_PRICING = {
    free: {
      workflowLimit: 2,
      price: 0,
      developmentPrice: 0,
      label: 'Free Plan',
      features: ['Basic workflow creation', 'Community support']
    },
    pro: {
      workflowLimit: 20,
      price: 199900, // ₹1999 in paise
      developmentPrice: 100, // ₹1 in paise for testing
      label: 'Pro Plan',
      features: ['Advanced workflows', 'Priority support', 'Analytics']
    },
    enterprise: {
      workflowLimit: 999,
      price: 499900, // ₹4999 in paise
      developmentPrice: 100, // ₹1 in paise for testing
      label: 'Enterprise Plan',
      features: ['Unlimited workflows', 'Dedicated support', 'Custom integrations']
    }
  };

  /**
   * Create a payment order with Razorpay
   */
  async createPaymentOrder(userId: string, planId: string): Promise<PaymentOrder> {
    try {
      if (!config.razorpayKeyId || !config.razorpayKeySecret) {
        throw new Error('Razorpay credentials not configured');
      }

      // Get plan details from database
      const { data: plan, error: planError } = await this.supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .single();

      if (planError || !plan) {
        throw new Error('Invalid plan selected');
      }

      if (plan.name.toLowerCase() === 'free') {
        throw new Error('Free plan does not require payment');
      }

      // Get user details
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('id, email')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Calculate amount (development vs production pricing)
      const amount = config.developmentPricing ? 100 : plan.price_inr; // ₹1 for testing
      const currency = 'INR';
      const receipt = `rcpt_${plan.name.toLowerCase()}_${userId}_${Date.now()}`;

      // Create Razorpay order
      const orderPayload = {
        amount,
        currency,
        receipt,
        notes: {
          planId: plan.id,
          planName: plan.name,
          userId: user.id,
          userEmail: user.email,
          workflowLimit: plan.workflow_limit.toString(),
          developmentMode: config.developmentPricing.toString(),
        },
      };

      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: this.getRazorpayAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PaymentService] Razorpay order creation failed:', errorText);
        throw new Error(`Failed to create Razorpay order: ${response.status}`);
      }

      const razorpayOrder = await response.json() as {
        id: string;
        status: string;
        amount: number;
        currency: string;
        receipt: string;
      };

      // Store payment intent in database
      const { error: paymentError } = await this.supabase
        .from('payments')
        .insert({
          user_id: userId,
          razorpay_order_id: razorpayOrder.id,
          amount_inr: amount,
          currency,
          status: 'created'
        });

      if (paymentError) {
        console.error('[PaymentService] Failed to store payment intent:', paymentError);
        throw new Error('Failed to store payment intent');
      }

      return {
        id: razorpayOrder.id,
        amount,
        currency,
        receipt,
        status: razorpayOrder.status,
        keyId: config.razorpayKeyId,
        user: {
          id: user.id,
          email: user.email
        },
        plan: {
          id: plan.id,
          name: plan.name,
          amount,
          workflowLimit: plan.workflow_limit,
          features: Array.isArray(plan.features) ? plan.features : []
        },
        developmentMode: config.developmentPricing
      };
    } catch (error: any) {
      console.error('[PaymentService] createPaymentOrder error:', error);
      throw error;
    }
  }

  /**
   * Verify payment signature and process subscription activation
   */
  async verifyPayment(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    userId: string
  ): Promise<PaymentVerification> {
    try {
      if (!config.razorpayKeySecret) {
        throw new Error('Razorpay secret key not configured');
      }

      // Verify payment signature
      const isValid = this.verifyRazorpaySignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        config.razorpayKeySecret
      );

      if (!isValid) {
        console.error('[PaymentService] Invalid payment signature:', {
          orderId: razorpayOrderId,
          paymentId: razorpayPaymentId
        });

        // Update payment status to failed
        await this.supabase
          .from('payments')
          .update({
            status: 'failed',
            failure_reason: 'Invalid signature',
            razorpay_payment_id: razorpayPaymentId,
            razorpay_signature: razorpaySignature
          })
          .eq('razorpay_order_id', razorpayOrderId);

        return {
          success: false,
          verified: false,
          paymentId: razorpayPaymentId,
          orderId: razorpayOrderId,
          signature: razorpaySignature,
          error: 'Invalid payment signature'
        };
      }

      // Get payment record
      const { data: payment, error: paymentError } = await this.supabase
        .from('payments')
        .select('*')
        .eq('razorpay_order_id', razorpayOrderId)
        .eq('user_id', userId)
        .single();

      if (paymentError || !payment) {
        throw new Error('Payment record not found');
      }

      // Update payment status to paid
      const { error: updateError } = await this.supabase
        .from('payments')
        .update({
          status: 'paid',
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: razorpaySignature,
          verified_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      if (updateError) {
        throw new Error(`Failed to update payment status: ${updateError.message}`);
      }

      // Get plan details from the order notes or fetch from database
      const { data: plans, error: plansError } = await this.supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true);

      if (plansError || !plans) {
        throw new Error('Failed to fetch subscription plans');
      }

      // Find the plan based on payment amount (simple matching for now)
      const plan = plans.find((p: any) => {
        const planAmount = config.developmentPricing ? 100 : p.price_inr;
        return planAmount === payment.amount_inr && p.name !== 'Free';
      });

      if (!plan) {
        throw new Error('Could not determine subscription plan from payment');
      }

      // Activate subscription
      const subscriptionResult = await this.subscriptionService.upgradeSubscription(
        userId,
        plan.id,
        payment.id
      );

      if (!subscriptionResult.success) {
        throw new Error(`Failed to activate subscription: ${subscriptionResult.error}`);
      }

      return {
        success: true,
        verified: true,
        paymentId: razorpayPaymentId,
        orderId: razorpayOrderId,
        signature: razorpaySignature
      };
    } catch (error: any) {
      console.error('[PaymentService] verifyPayment error:', error);
      return {
        success: false,
        verified: false,
        paymentId: razorpayPaymentId,
        orderId: razorpayOrderId,
        signature: razorpaySignature,
        error: error.message || 'Payment verification failed'
      };
    }
  }

  /**
   * Handle Razorpay webhook notifications
   */
  async handleWebhook(webhookData: RazorpayWebhook, signature: string): Promise<void> {
    try {
      if (!config.razorpayWebhookSecret) {
        console.warn('[PaymentService] Webhook secret not configured, skipping verification');
        return;
      }

      // Verify webhook signature
      const isValid = this.verifyWebhookSignature(
        JSON.stringify(webhookData),
        signature,
        config.razorpayWebhookSecret
      );

      if (!isValid) {
        console.error('[PaymentService] Invalid webhook signature');
        return;
      }

      // Process webhook based on event type
      switch (webhookData.event) {
        case 'payment.captured':
          await this.handlePaymentCaptured(webhookData);
          break;
        case 'payment.failed':
          await this.handlePaymentFailed(webhookData);
          break;
        case 'order.paid':
          await this.handleOrderPaid(webhookData);
          break;
        default:
          console.log(`[PaymentService] Unhandled webhook event: ${webhookData.event}`);
      }
    } catch (error: any) {
      console.error('[PaymentService] handleWebhook error:', error);
    }
  }

  /**
   * Retry failed payment processing
   */
  async retryFailedPayment(paymentId: string): Promise<PaymentResult> {
    try {
      const { data: payment, error } = await this.supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (error || !payment) {
        return {
          success: false,
          error: 'Payment record not found'
        };
      }

      if (payment.status !== 'failed') {
        return {
          success: false,
          error: 'Payment is not in failed state'
        };
      }

      // Attempt to re-verify the payment with Razorpay
      if (payment.razorpay_payment_id && payment.razorpay_signature) {
        const verificationResult = await this.verifyPayment(
          payment.razorpay_order_id,
          payment.razorpay_payment_id,
          payment.razorpay_signature,
          payment.user_id
        );

        if (verificationResult.success) {
          return {
            success: true,
            paymentId: payment.id,
            subscriptionId: payment.subscription_id
          };
        }
      }

      return {
        success: false,
        error: 'Payment retry failed'
      };
    } catch (error: any) {
      console.error('[PaymentService] retryFailedPayment error:', error);
      return {
        success: false,
        error: error.message || 'Payment retry failed'
      };
    }
  }

  /**
   * Get payment history for a user
   */
  async getPaymentHistory(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const { data: payments, error } = await this.supabase
        .from('payments')
        .select(`
          *,
          subscriptions (
            id,
            subscription_plans (
              name,
              workflow_limit
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch payment history: ${error.message}`);
      }

      return payments || [];
    } catch (error: any) {
      console.error('[PaymentService] getPaymentHistory error:', error);
      throw error;
    }
  }

  /**
   * Get payment analytics for admin dashboard
   */
  async getPaymentAnalytics(days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: payments, error } = await this.supabase
        .from('payments')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .eq('status', 'paid');

      if (error) {
        throw new Error(`Failed to fetch payment analytics: ${error.message}`);
      }

      const totalRevenue = (payments || []).reduce((sum: number, payment: any) => sum + payment.amount_inr, 0);
      const totalTransactions = payments?.length || 0;
      const averageTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

      return {
        totalRevenue,
        totalTransactions,
        averageTransactionValue,
        period: `${days} days`,
        payments: payments || []
      };
    } catch (error: any) {
      console.error('[PaymentService] getPaymentAnalytics error:', error);
      throw error;
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  private verifyRazorpaySignature(
    orderId: string,
    paymentId: string,
    signature: string,
    secret: string
  ): boolean {
    try {
      const body = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error: any) {
      console.error('[PaymentService] verifyRazorpaySignature error:', error);
      return false;
    }
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return `sha256=${expectedSignature}` === signature;
    } catch (error: any) {
      console.error('[PaymentService] verifyWebhookSignature error:', error);
      return false;
    }
  }

  /**
   * Get Razorpay authorization header
   */
  private getRazorpayAuthHeader(): string {
    const keyId = config.razorpayKeyId;
    const keySecret = config.razorpayKeySecret;
    
    if (!keyId || !keySecret) {
      throw new Error('Razorpay keys are not configured');
    }
    
    return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  }

  /**
   * Handle payment captured webhook
   */
  private async handlePaymentCaptured(webhookData: RazorpayWebhook): Promise<void> {
    try {
      const payment = webhookData.payload.payment?.entity;
      if (!payment) return;

      // Update payment status
      await this.supabase
        .from('payments')
        .update({
          status: 'paid',
          webhook_received_at: new Date().toISOString()
        })
        .eq('razorpay_payment_id', payment.id);

      console.log(`[PaymentService] Payment captured: ${payment.id}`);
    } catch (error: any) {
      console.error('[PaymentService] handlePaymentCaptured error:', error);
    }
  }

  /**
   * Handle payment failed webhook
   */
  private async handlePaymentFailed(webhookData: RazorpayWebhook): Promise<void> {
    try {
      const payment = webhookData.payload.payment?.entity;
      if (!payment) return;

      // Update payment status
      await this.supabase
        .from('payments')
        .update({
          status: 'failed',
          failure_reason: payment.error_description || 'Payment failed',
          webhook_received_at: new Date().toISOString()
        })
        .eq('razorpay_payment_id', payment.id);

      console.log(`[PaymentService] Payment failed: ${payment.id}`);
    } catch (error: any) {
      console.error('[PaymentService] handlePaymentFailed error:', error);
    }
  }

  /**
   * Handle order paid webhook
   */
  private async handleOrderPaid(webhookData: RazorpayWebhook): Promise<void> {
    try {
      const order = webhookData.payload.order?.entity;
      if (!order) return;

      console.log(`[PaymentService] Order paid: ${order.id}`);
    } catch (error: any) {
      console.error('[PaymentService] handleOrderPaid error:', error);
    }
  }
}

// Singleton instance
let paymentServiceInstance: PaymentService | null = null;

export function getPaymentService(): PaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new PaymentService();
  }
  return paymentServiceInstance;
}