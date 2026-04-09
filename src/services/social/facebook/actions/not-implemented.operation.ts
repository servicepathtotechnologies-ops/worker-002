import { FacebookNotYetImplementedError } from '../shared/ErrorHandler.helper';
import { FacebookNodeParams } from '../types/facebook.types';

export async function notImplementedOperation(params: FacebookNodeParams): Promise<never> {
  throw new FacebookNotYetImplementedError(params.resource, params.operation);
}
