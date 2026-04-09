import { Request, Response } from 'express';
import crypto from 'crypto';

type PlanId = 'pro' | 'enterprise';
type SupportedCurrency = 'USD' | 'INR';

const PLAN_PRICING: Record<PlanId, Record<SupportedCurrency, { amount: number; label: string }>> = {
  pro: {
    USD: { amount: 2000, label: 'Pro Plan' },
    INR: { amount: 166000, label: 'Pro Plan' },
  },
  enterprise: {
    USD: { amount: 9900, label: 'Enterprise Plan' },
    INR: { amount: 822000, label: 'Enterprise Plan' },
  },
};

function getRazorpayAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys are not configured');
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export async function createRazorpayOrder(req: Request, res: Response) {
  try {
    const planId = String(req.body?.planId || '').toLowerCase() as PlanId;
    const requestedCurrency = String(req.body?.currency || 'USD').toUpperCase() as SupportedCurrency;

    if (!PLAN_PRICING[planId]) {
      return res.status(400).json({ success: false, error: 'Invalid plan selected' });
    }
    if (!['USD', 'INR'].includes(requestedCurrency)) {
      return res.status(400).json({ success: false, error: 'Unsupported currency. Use USD or INR.' });
    }

    const plan = PLAN_PRICING[planId][requestedCurrency];
    const receipt = `rcpt_${planId}_${Date.now()}`;
    const orderPayload = {
      amount: plan.amount,
      currency: requestedCurrency,
      receipt,
      notes: {
        planId,
        planLabel: plan.label,
        selectedCurrency: requestedCurrency,
      },
    };

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: getRazorpayAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(502).json({
        success: false,
        error: `Failed to create Razorpay order: ${errorText}`,
      });
    }

    const order = await response.json();
    return res.json({
      success: true,
      order,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan: {
        id: planId,
        amount: plan.amount,
        currency: requestedCurrency,
        label: plan.label,
      },
      checkoutCapabilities: {
        cards: true,
        upi: requestedCurrency === 'INR',
        netbanking: requestedCurrency === 'INR',
        wallets: requestedCurrency === 'INR',
        emi: requestedCurrency === 'INR',
        paylater: requestedCurrency === 'INR',
      },
    });
  } catch (error: any) {
    console.error('[Razorpay] create-order failed:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to create order',
    });
  }
}

export async function verifyRazorpayPayment(req: Request, res: Response) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !planId) {
      return res.status(400).json({ success: false, error: 'Missing required payment fields' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(500).json({ success: false, error: 'Razorpay secret key missing' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isValid = generatedSignature === razorpay_signature;
    if (!isValid) {
      return res.status(400).json({ success: false, verified: false, error: 'Invalid payment signature' });
    }

    return res.json({
      success: true,
      verified: true,
      message: 'Payment verified successfully',
      subscription: {
        planId,
        status: 'active',
      },
    });
  } catch (error: any) {
    console.error('[Razorpay] verify failed:', error?.message || error);
    return res.status(500).json({
      success: false,
      verified: false,
      error: error?.message || 'Failed to verify payment',
    });
  }
}
