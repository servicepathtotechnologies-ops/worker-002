/**
 * Pass-Through Worker
 * 
 * Handles simple nodes that just pass input to output:
 * - manual_trigger
 * - set_variable
 * - text_formatter (basic)
 */

import { NodeWorker } from '../node-worker';

export class PassThroughWorker extends NodeWorker {
  protected async executeNodeLogic(
    inputs: Record<string, unknown>,
    executionId: string,
    nodeId: string
  ): Promise<{
    outputs: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }> {
    // For manual_trigger and other pass-through nodes, just pass input to output
    // The input data comes from the execution's input field
    return {
      outputs: inputs, // Pass all inputs as outputs
      metadata: {
        node_type: this.nodeType,
        processed_at: new Date().toISOString(),
      },
    };
  }
}
