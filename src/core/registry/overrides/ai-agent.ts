import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { overrideAiNodeWithIntentAwareSelection } from './ai-shared';

export function overrideAiAgent(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  return overrideAiNodeWithIntentAwareSelection(def, schema);
}

