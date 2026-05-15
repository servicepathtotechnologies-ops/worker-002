import type { LRUNodeOutputsCache } from '../../cache/lru-node-outputs-cache';
import { createExecutionContext, setNodeOutput } from '../typed-execution-context';
import { resolveTypedValue } from '../typed-value-resolver';

function getStringProperty(obj: Record<string, unknown>, key: string, defaultVal: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : defaultVal;
}

/**
 * log_output / log execution without routing through executeNodeLegacy.
 * Config is expected to be template-resolved when produced by the registry adapter path.
 */
export function executeLogOutputWithCache(
  config: Record<string, unknown>,
  input: unknown,
  nodeOutputs: LRUNodeOutputsCache
): string {
  const message = getStringProperty(config, 'message', '');
  const level = getStringProperty(config, 'level', 'info');

  const execContext = createExecutionContext(input);
  Object.entries(nodeOutputs.getAll()).forEach(([nodeId, output]) => {
    setNodeOutput(execContext, nodeId, output);
  });
  // Restore lastOutput to current node's input so {{$json.field}} resolves correctly.
  // The setNodeOutput loop overwrites lastOutput with each previous node's output in
  // LRU iteration order, which is not guaranteed to be the immediate upstream node.
  execContext.lastOutput = input;

  const resolvedValue = resolveTypedValue(message, execContext);

  let resolvedMessage: string;
  if (resolvedValue === null || resolvedValue === undefined) {
    resolvedMessage = String(resolvedValue);
  } else if (typeof resolvedValue === 'object') {
    try {
      resolvedMessage = JSON.stringify(resolvedValue, null, 2);
    } catch {
      resolvedMessage = String(resolvedValue);
    }
  } else {
    resolvedMessage = String(resolvedValue);
  }

  const logPrefix = `[LOG ${level.toUpperCase()}]`;
  switch (level) {
    case 'error':
      console.error(`${logPrefix} ${resolvedMessage}`);
      break;
    case 'warn':
      console.warn(`${logPrefix} ${resolvedMessage}`);
      break;
    case 'debug':
      console.debug(`${logPrefix} ${resolvedMessage}`);
      break;
    default:
      console.log(`${logPrefix} ${resolvedMessage}`);
  }

  return resolvedMessage;
}
