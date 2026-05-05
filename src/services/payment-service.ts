import * as crypto from 'crypto';
import { getDbClient } from '../core/database/supabase-compat';
import { config } from '../core/config';
import { subscriptionService } from './subscription-service';

export interface PaymentOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  notes: Record<string, string>;
  createdAt: Date;
}

export interface PaymentVerification {
  isValid: boolean;
  paymentId: string;
  orderId: string;
  signature: string;
  amount: number;
  planId: string;
  userId: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  subscriptionId?: string;
  subscription?: {
    id: string;
    planName: string;
    workflowLimit: number;
    workflowsUsed: number;
    status: string;
  };
  error?: string;
  code?: string;
}

export interface RazorpayWebhook {
  event: string;
  payload: {
    payment: {
      entity: PaymentEntity;
    };
    order: {
      entity: OrderEntity;
    };
  };
  created_at: number;
}

export interface PaymentEntity {
  id: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  method: string;
  captured: boolean;
  description?: string;
  email?: string;
  contact?: string;
  fee?: number;
  tax?: number;
  error_code?: string;
  error_description?: string;
  created_at: number;
}

export interface OrderEntity {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  notes: Record<string, string>;
  created_at: number;
}

/**
 * Comprehensive payment service with Razorpay integration
 */
export class PaymentService {
  private readonly razorpayKeyId: string;
  private readonly razorpayKeySecret: string;
  private readonly webhookSecret: string;

  constructor() {
    this.razorpayKeyId = config.razorpayKeyId || '';
    this.razorpayKeySecret = config.razorpayKeySecret || '';
    this.webhookSecret = config.razorpayWebhookSecret || '';

    if (!this.razorpayKeyId || !this.razorpayKeySecret) {
      console.warn('[PaymentService] Razorpay credentials not configured');
    }
  }

  /**
   * Create payment order with Razorpay
   */
  async createPaymentOrder(
    userId: string,
    planName: string,
    userEmail: string
  ): Promise<PaymentOrder> {
    try {
      // Get plan details
      const plan = await subscriptionService.getPlanByName(planName as 'Free' | 'Pro' | 'Enterprise');
      if (!plan) {
        throw new Error(`Invalid plan: ${planName}`);
      }

      if (plan.name === 'Free') {
        throw new Error('Free plan does not require payment');
      }

      const amount = plan.price;
      const currency = 'INR';
      // Razorpay receipt max 40 chars: "rcpt_" (5) + plan (3) + "_" + last8 of userId (8) + "_" + last8 of timestamp (8) = 25 chars
      const receipt = `rcpt_${planName.slice(0,3).toLowerCase()}_${userId.slice(-8)}_${Date.now().toString().slice(-8)}`;

      const orderPayload = {
        amount,
        currency,
        receipt,
        notes: {
          planId: planName.toLowerCase(),
          planName: plan.name,
          userId,
          userEmail,
          workflowLimit: plan.workflowLimit.toString(),
          developmentMode: plan.developmentMode.toString(),
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
        console.error('[PaymentService] Order creation failed:', errorText);
        throw new Error(`Failed to create Razorpay order: ${response.status}`);
      }

      const order = await response.json() as {
        id: string;
        amount: number;
        currency: string;
        receipt: string;
        status: 'created' | 'attempted' | 'paid';
        notes: Record<string, string>;
        created_at: number;
      };

      // Store payment intent in database
      await this.storePaymentIntent(userId, order, planName);

      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        notes: order.notes,
        createdAt: new Date(order.created_at * 1000)
      };
    } catch (error: any) {
      console.error('[PaymentService] createPaymentOrder error:', error);
      throw error;
    }
  }

  /**
   * Verify payment signature from Razorpay
   */
  verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): boolean {
    try {
      if (!this.razorpayKeySecret) {
        throw new Error('Razorpay secret key not configured');
      }

      const body = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.razorpayKeySecret)
        .update(body)
        .digest('hex');

      return this.safeCompare(expectedSignature, signature);
    } catch (error: any) {
      console.error('[PaymentService] verifyPaymentSignature error:', error);
      return false;
    }
  }

  /**
   * Process payment verification and activate subscription
   */
  async processPaymentVerification(
    userId: string,
    orderId: string,
    paymentId: string,
    signature: string
  ): Promise<PaymentResult> {
    try {
      const isValidSignature = this.verifyPaymentSignature(orderId, paymentId, signature);
      
      if (!isValidSignature) {
        console.error('[PaymentService] Invalid payment signature:', {
          orderId,
          paymentId,
          userId
        });
        
        return {
          success: false,
          error: 'Invalid payment signature',
          code: 'INVALID_SIGNATURE'
        };
      }

      const razorpayOrder = await this.fetchRazorpayOrder(orderId);
      const razorpayPayment = await this.fetchRazorpayPayment(paymentId);

      if (razorpayPayment.order_id !== orderId) {
        return {
          success: false,
          error: 'Payment does not belong to this order',
          code: 'PAYMENT_ORDER_MISMATCH'
        };
      }

      const supabase = getDbClient();
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .eq('user_id', userId)
        .single();

      if (paymentError || !payment) {
        console.error('[PaymentService] Payment record not found:', paymentError);
        return {
          success: false,
          error: 'Payment record not found',
          code: 'PAYMENT_NOT_FOUND'
        };
      }

      if (payment.status === 'paid') {
        const orderNotes = razorpayOrder.notes || {};
        const orderPlanName = orderNotes.planName;
        const plan = await subscriptionService.getPlanByName(orderPlanName);
        if (!plan || plan.name === 'Free') {
          return {
            success: false,
            error: 'Invalid paid plan in payment order',
            code: 'INVALID_ORDER_PLAN'
          };
        }

        const existingSubscription = await subscriptionService.getUserSubscription(userId);
        if (!payment.subscription_id) {
          const activationRetry = await subscriptionService.upgradeSubscription(
            userId,
            plan.name,
            payment.id
          );

          if (!activationRetry.success) {
            console.error('[PaymentService] Failed to retry subscription activation:', activationRetry.error);
            return {
              success: false,
              error: activationRetry.error || 'Failed to activate subscription',
              code: 'ACTIVATION_FAILED'
            };
          }

          return {
            success: true,
            paymentId: payment.id,
            subscriptionId: activationRetry.subscription?.id,
            subscription: activationRetry.subscription
              ? {
                  id: activationRetry.subscription.id,
                  planName: activationRetry.subscription.planName,
                  workflowLimit: activationRetry.subscription.workflowLimit,
                  workflowsUsed: activationRetry.subscription.workflowsUsed,
                  status: activationRetry.subscription.status
                }
              : undefined
          };
        }

        return {
          success: true,
          paymentId: payment.id,
          subscriptionId: existingSubscription?.id,
          subscription: existingSubscription
            ? {
                id: existingSubscription.id,
                planName: existingSubscription.planName,
                workflowLimit: existingSubscription.workflowLimit,
                workflowsUsed: existingSubscription.workflowsUsed,
                status: existingSubscription.status
              }
            : undefined
        };
      }

      const orderNotes = razorpayOrder.notes || {};
      const orderPlanName = orderNotes.planName;

      if (orderNotes.userId !== userId) {
        await this.markPaymentFailed(payment.id, paymentId, signature, 'Razorpay order user mismatch');
        return {
          success: false,
          error: 'Payment order does not belong to this user',
          code: 'ORDER_USER_MISMATCH'
        };
      }

      const plan = await subscriptionService.getPlanByName(orderPlanName);
      if (!plan || plan.name === 'Free') {
        await this.markPaymentFailed(payment.id, paymentId, signature, 'Invalid paid plan in Razorpay order');
        return {
          success: false,
          error: 'Invalid paid plan in payment order',
          code: 'INVALID_ORDER_PLAN'
        };
      }

      const expectedAmount = plan.price;
      if (
        payment.amount_inr !== expectedAmount ||
        razorpayOrder.amount !== expectedAmount ||
        razorpayPayment.amount !== expectedAmount ||
        razorpayOrder.currency !== 'INR' ||
        razorpayPayment.currency !== 'INR'
      ) {
        await this.markPaymentFailed(payment.id, paymentId, signature, 'Payment amount or currency mismatch');
        return {
          success: false,
          error: 'Payment amount or currency mismatch',
          code: 'AMOUNT_MISMATCH'
        };
      }

      if (!['captured', 'authorized'].includes(razorpayPayment.status)) {
        await this.markPaymentFailed(payment.id, paymentId, signature, `Razorpay payment status: ${razorpayPayment.status}`);
        return {
          success: false,
          error: `Payment is not complete. Current status: ${razorpayPayment.status}`,
          code: 'PAYMENT_NOT_COMPLETE'
        };
      }

      const { error: updateError } = await supabase
        .from('payments')
        .update({
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
          status: 'paid',
          payment_method: razorpayPayment.method || null,
          verified_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      if (updateError) {
        console.error('[PaymentService] Failed to update payment:', updateError);
        return {
          success: false,
          error: 'Failed to update payment record',
          code: 'UPDATE_FAILED'
        };
      }

      const subscriptionResult = await subscriptionService.upgradeSubscription(
        userId,
        plan.name,
        payment.id
      );

      if (!subscriptionResult.success) {
        console.error('[PaymentService] Failed to activate subscription:', subscriptionResult.error);
        return {
          success: false,
          error: subscriptionResult.error || 'Failed to activate subscription',
          code: 'ACTIVATION_FAILED'
        };
      }

      return {
        success: true,
        paymentId: payment.id,
        subscriptionId: subscriptionResult.subscription?.id,
        subscription: subscriptionResult.subscription
          ? {
              id: subscriptionResult.subscription.id,
              planName: subscriptionResult.subscription.planName,
              workflowLimit: subscriptionResult.subscription.workflowLimit,
              workflowsUsed: subscriptionResult.subscription.workflowsUsed,
              status: subscriptionResult.subscription.status
            }
          : undefined
      };
    } catch (error: any) {
      console.error('[PaymentService] processPaymentVerification error:', error);
      return {
        success: false,
        error: error?.message || 'Payment verification failed',
        code: 'VERIFICATION_ERROR'
      };
    }
  }

  /**
   * Handle Razorpay webhook
   */
  async handleWebhook(
    payload: string,
    signature: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Verify webhook signature
      const isValidWebhook = this.verifyWebhookSignature(payload, signature);
      
      if (!isValidWebhook) {
        console.error('[PaymentService] Invalid webhook signature');
        return {
          success: false,
          message: 'Invalid webhook signature'
        };
      }

      const webhookData: RazorpayWebhook = JSON.parse(payload);
      
      // Handle different webhook events
      switch (webhookData.event) {
        case 'payment.captured':
          await this.handlePaymentCaptured(webhookData.payload.payment.entity);
          break;
        case 'payment.failed':
          await this.handlePaymentFailed(webhookData.payload.payment.entity);
          break;
        case 'order.paid':
          await this.handleOrderPaid(webhookData.payload.order.entity);
          break;
        default:
          console.log(`[PaymentService] Unhandled webhook event: ${webhookData.event}`);
      }

      return {
        success: true,
        message: 'Webhook processed successfully'
      };
    } catch (error: any) {
      console.error('[PaymentService] handleWebhook error:', error);
      return {
        success: false,
        message: error?.message || 'Webhook processing failed'
      };
    }
  }

  /**
   * Retry failed payment
   */
  async retryFailedPayment(paymentId: string): Promise<PaymentResult> {
    try {
      const supabase = getDbClient();
      
      // Get payment record
      const { data: payment, error } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (error || !payment) {
        return {
          success: false,
          error: 'Payment record not found',
          code: 'PAYMENT_NOT_FOUND'
        };
      }

      if (payment.status === 'paid') {
        return {
          success: false,
          error: 'Payment already completed',
          code: 'ALREADY_PAID'
        };
      }

      // Create new order for retry
      const planName = payment.amount_inr === 100 ? 'Pro' : 'Enterprise'; // Simplified logic
      const newOrder = await this.createPaymentOrder(
        payment.user_id,
        planName,
        payment.user_email || 'unknown@example.com'
      );

      return {
        success: true,
        paymentId: newOrder.id
      };
    } catch (error: any) {
      console.error('[PaymentService] retryFailedPayment error:', error);
      return {
        success: false,
        error: error?.message || 'Failed to retry payment',
        code: 'RETRY_ERROR'
      };
    }
  }

  /**
   * Get payment history for user
   */
  async getPaymentHistory(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const supabase = getDbClient();
      
      const { data: payments, error } = await supabase
        .from('payments')
        .select(`
          id,
          razorpay_order_id,
          razorpay_payment_id,
          amount_inr,
          currency,
          status,
          payment_method,
          created_at,
          verified_at,
          subscription_id,
          subscriptions (
            subscription_plans (
              name
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[PaymentService] Failed to get payment history:', error);
        throw new Error(`Failed to get payment history: ${error.message}`);
      }

      return (payments || []).map((payment: any) => ({
        id: payment.id,
        orderId: payment.razorpay_order_id,
        paymentId: payment.razorpay_payment_id,
        amount: payment.amount_inr,
        currency: payment.currency,
        status: payment.status,
        method: payment.payment_method,
        planName: (payment.subscriptions as any)?.subscription_plans?.name || 'Unknown',
        createdAt: payment.created_at,
        verifiedAt: payment.verified_at
      }));
    } catch (error: any) {
      console.error('[PaymentService] getPaymentHistory error:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private getRazorpayAuthHeader(): string {
    if (!this.razorpayKeyId || !this.razorpayKeySecret) {
      throw new Error('Razorpay credentials not configured');
    }
    
    return `Basic ${Buffer.from(`${this.razorpayKeyId}:${this.razorpayKeySecret}`).toString('base64')}`;
  }

  private safeCompare(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual || '');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }

  private verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      if (!this.webhookSecret) {
        console.warn('[PaymentService] Webhook secret not configured');
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      return (
        this.safeCompare(expectedSignature, signature) ||
        this.safeCompare(`sha256=${expectedSignature}`, signature)
      );
    } catch (error: any) {
      console.error('[PaymentService] verifyWebhookSignature error:', error);
      return false;
    }
  }

  private async storePaymentIntent(
    userId: string,
    order: any,
    planName: string
  ): Promise<void> {
    try {
      const supabase = getDbClient();
      
      const { error } = await supabase
        .from('payments')
        .insert({
          user_id: userId,
          razorpay_order_id: order.id,
          amount_inr: order.amount,
          currency: order.currency,
          status: 'created'
        });

      if (error) {
        console.error('[PaymentService] Failed to store payment intent:', error);
        throw new Error(`Failed to store payment intent: ${error.message}`);
      }
    } catch (error: any) {
      console.error('[PaymentService] storePaymentIntent error:', error);
      throw error;
    }
  }

  private async markPaymentFailed(
    paymentRecordId: string,
    paymentId: string,
    signature: string,
    reason: string
  ): Promise<void> {
    const supabase = getDbClient();
    const { error } = await supabase
      .from('payments')
      .update({
        status: 'failed',
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        failure_reason: reason
      })
      .eq('id', paymentRecordId);

    if (error) {
      console.error('[PaymentService] Failed to mark payment failed:', error);
    }
  }

  private async fetchRazorpayOrder(orderId: string): Promise<OrderEntity> {
    const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: {
        Authorization: this.getRazorpayAuthHeader(),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PaymentService] Failed to fetch Razorpay order:', errorText);
      throw new Error(`Failed to fetch Razorpay order: ${response.status}`);
    }

    return await response.json() as OrderEntity;
  }

  private async fetchRazorpayPayment(paymentId: string): Promise<PaymentEntity> {
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        Authorization: this.getRazorpayAuthHeader(),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PaymentService] Failed to fetch Razorpay payment:', errorText);
      throw new Error(`Failed to fetch Razorpay payment: ${response.status}`);
    }

    return await response.json() as PaymentEntity;
  }

  private async handlePaymentCaptured(payment: PaymentEntity): Promise<void> {
    try {
      console.log(`[PaymentService] Payment captured: ${payment.id}`);
      
      const supabase = getDbClient();
      
      // Update payment status
      const { error } = await supabase
        .from('payments')
        .update({
          razorpay_payment_id: payment.id,
          status: 'paid',
          payment_method: payment.method,
          verified_at: new Date().toISOString(),
          webhook_received_at: new Date().toISOString()
        })
        .eq('razorpay_order_id', payment.order_id);

      if (error) {
        console.error('[PaymentService] Failed to update payment on capture:', error);
      }
    } catch (error: any) {
      console.error('[PaymentService] handlePaymentCaptured error:', error);
    }
  }

  private async handlePaymentFailed(payment: PaymentEntity): Promise<void> {
    try {
      console.log(`[PaymentService] Payment failed: ${payment.id}`);
      
      const supabase = getDbClient();
      
      // Update payment status
      const { error } = await supabase
        .from('payments')
        .update({
          razorpay_payment_id: payment.id,
          status: 'failed',
          payment_method: payment.method,
          failure_reason: payment.error_description || 'Payment failed',
          webhook_received_at: new Date().toISOString()
        })
        .eq('razorpay_order_id', payment.order_id);

      if (error) {
        console.error('[PaymentService] Failed to update payment on failure:', error);
      }
    } catch (error: any) {
      console.error('[PaymentService] handlePaymentFailed error:', error);
    }
  }

  private async handleOrderPaid(order: OrderEntity): Promise<void> {
    try {
      console.log(`[PaymentService] Order paid: ${order.id}`);
      
      // Additional processing for paid orders if needed
      // This is called when an order is fully paid
    } catch (error: any) {
      console.error('[PaymentService] handleOrderPaid error:', error);
    }
  }
}

// Export singleton instance
export const paymentService = new PaymentService();
