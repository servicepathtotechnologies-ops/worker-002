import { AsyncLocalStorage } from 'async_hooks';

export interface GeminiWalletContext {
  userId?: string;
}

const walletContext = new AsyncLocalStorage<GeminiWalletContext>();

export function runWithGeminiWalletContext<T>(context: GeminiWalletContext, fn: () => T): T {
  return walletContext.run(context, fn);
}

export function getGeminiWalletContext(): GeminiWalletContext | undefined {
  return walletContext.getStore();
}
