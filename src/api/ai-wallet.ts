import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../core/middleware/subscription-auth';
import { GeminiWalletError, geminiWalletService } from '../services/ai/gemini-wallet-service';

function userId(req: Request): string {
  const id = (req as AuthenticatedRequest).user?.id;
  if (!id) throw new GeminiWalletError('GEMINI_WALLET_INVALID', 'Authenticated user is required.', 'invalid');
  return id;
}

function sendWalletError(res: Response, error: unknown) {
  if (error instanceof GeminiWalletError) {
    return res.status(error.code === 'GEMINI_WALLET_PROVIDER_ERROR' ? 503 : 400).json({
      success: false,
      code: error.code,
      error: error.message,
      walletStatus: error.walletStatus,
    });
  }
  return res.status(500).json({
    success: false,
    code: 'GEMINI_WALLET_ERROR',
    error: error instanceof Error ? error.message : 'Gemini wallet request failed',
  });
}

export async function getGeminiWalletHandler(req: Request, res: Response) {
  try {
    return res.json({ success: true, wallet: await geminiWalletService.getState(userId(req)) });
  } catch (error) {
    return sendWalletError(res, error);
  }
}

export async function saveGeminiWalletHandler(req: Request, res: Response) {
  try {
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
    return res.json({ success: true, wallet: await geminiWalletService.saveKey(userId(req), apiKey) });
  } catch (error) {
    return sendWalletError(res, error);
  }
}

export async function testGeminiWalletHandler(req: Request, res: Response) {
  try {
    return res.json({ success: true, wallet: await geminiWalletService.testWallet(userId(req)) });
  } catch (error) {
    return sendWalletError(res, error);
  }
}

export async function activateGeminiWalletHandler(req: Request, res: Response) {
  try {
    return res.json({ success: true, wallet: await geminiWalletService.activate(userId(req)) });
  } catch (error) {
    return sendWalletError(res, error);
  }
}

export async function deactivateGeminiWalletHandler(req: Request, res: Response) {
  try {
    return res.json({ success: true, wallet: await geminiWalletService.deactivate(userId(req)) });
  } catch (error) {
    return sendWalletError(res, error);
  }
}

export async function deleteGeminiWalletHandler(req: Request, res: Response) {
  try {
    return res.json({ success: true, wallet: await geminiWalletService.deleteWallet(userId(req)) });
  } catch (error) {
    return sendWalletError(res, error);
  }
}
