import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './subscription-auth';
import { runWithGeminiWalletContext } from '../../services/ai/gemini-wallet-context';

export async function geminiWalletContextMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  return runWithGeminiWalletContext({ userId: req.user?.id }, () => next());
}
