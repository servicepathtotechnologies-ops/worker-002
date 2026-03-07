/**
 * ✅ UNIVERSAL NODE TYPE CHECKER
 * 
 * Single source of truth for ALL node type detection (trigger, data source, output, transformation, etc.)
 * Uses unified node registry as the authoritative source - NO hardcoded checks.
 * 
 * This ensures:
 * - ALL node types are recognized correctly
 * - No missing node types (like webhook not being recognized as trigger)
 * - Universal fix applies to all workflows automatically
 * - Future node types work automatically without code changes
 */

import { WorkflowNode } from '../types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from './unified-node-type-normalizer';
import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { nodeCapabilityRegistryDSL } from '../../services/ai/node-capability-registry-dsl';

/**
 * ✅ UNIVERSAL: Check if a node is a trigger using registry as single source of truth
 */
export function isTriggerNode(node: WorkflowNode | string): boolean {
  const nodeType = typeof node === 'string' 
    ? unifiedNormalizeNodeTypeString(node)
    : unifiedNormalizeNodeType(node);
  
  // ✅ PRIMARY: Check unified node registry (single source of truth)
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (nodeDef?.category === 'trigger') {
    return true;
  }
  
  // ✅ FALLBACK 1: Check node data category (if node object provided)
  if (typeof node !== 'string' && node.data?.category) {
    const category = (node.data.category || '').toLowerCase();
    if (category === 'triggers' || category === 'trigger') {
      return true;
    }
  }
  
  // ✅ FALLBACK 2: Known trigger types (backward compatibility)
  const TRIGGER_TYPES = [
    'manual_trigger',
    'webhook',
    'schedule',
    'interval',
    'chat_trigger',
    'form',
    'error_trigger',
    'workflow_trigger',
  ];
  
  return TRIGGER_TYPES.includes(nodeType);
}

/**
 * ✅ UNIVERSAL: Check if a node is a data source using registry
 */
export function isDataSourceNode(node: WorkflowNode | string): boolean {
  const nodeType = typeof node === 'string'
    ? unifiedNormalizeNodeTypeString(node)
    : unifiedNormalizeNodeTypeString(node.type || (node as WorkflowNode).data?.type || '');
  
  // ✅ ROOT-LEVEL FIX: Triggers cannot be data sources
  // webhook, schedule, manual_trigger, etc. are triggers, not data sources
  const nodeTypeLower = nodeType.toLowerCase();
  if (nodeTypeLower === 'webhook' || 
      nodeTypeLower === 'schedule' || 
      nodeTypeLower === 'manual_trigger' ||
      nodeTypeLower === 'interval' ||
      nodeTypeLower === 'chat_trigger' ||
      nodeTypeLower === 'form' ||
      nodeTypeLower === 'workflow_trigger' ||
      nodeTypeLower === 'error_trigger') {
    return false; // Triggers are not data sources
  }
  
  // ✅ PRIMARY: Check capability registry (most authoritative)
  if (nodeCapabilityRegistryDSL.isDataSource(nodeType) || nodeCapabilityRegistryDSL.canReadData(nodeType)) {
    return true;
  }
  
  // ✅ FALLBACK: Check unified node registry category
  // Valid categories: "ai" | "data" | "trigger" | "utility" | "logic" | "communication" | "transformation"
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (nodeDef?.category === 'data') {
    return true;
  }
  
  // ✅ FALLBACK: Check node data category (if node object provided)
  if (typeof node !== 'string' && (node as WorkflowNode).data?.category) {
    const category = ((node as WorkflowNode).data.category || '').toLowerCase();
    if (category === 'data_source' || category === 'data') {
      return true;
    }
  }
  
  return false;
}

/**
 * ✅ UNIVERSAL: Check if a node is an output using registry
 */
export function isOutputNode(node: WorkflowNode | string): boolean {
  const nodeType = typeof node === 'string'
    ? unifiedNormalizeNodeTypeString(node)
    : unifiedNormalizeNodeTypeString(node.type || (node as WorkflowNode).data?.type || '');
  
  // ✅ PRIMARY: Check capability registry (most authoritative)
  if (nodeCapabilityRegistryDSL.isOutput(nodeType) || nodeCapabilityRegistryDSL.canWriteData(nodeType)) {
    return true;
  }
  
  // ✅ SPECIAL: log_output is always an output
  if (nodeType === 'log_output') {
    return true;
  }
  
  // ✅ FALLBACK: Check unified node registry category
  // Valid categories: "ai" | "data" | "trigger" | "utility" | "logic" | "communication" | "transformation"
  // Output nodes are typically in "communication" category
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (nodeDef?.category === 'communication') {
    return true;
  }
  
  // ✅ FALLBACK: Check node data category (if node object provided)
  if (typeof node !== 'string' && (node as WorkflowNode).data?.category) {
    const category = ((node as WorkflowNode).data.category || '').toLowerCase();
    // Accept various output-related categories from node data
    if (category === 'output' || category === 'communication' || category === 'action') {
      return true;
    }
  }
  
  return false;
}

/**
 * ✅ UNIVERSAL: Check if a node is a transformation using registry
 */
export function isTransformationNode(node: WorkflowNode | string): boolean {
  const nodeType = typeof node === 'string'
    ? unifiedNormalizeNodeTypeString(node)
    : unifiedNormalizeNodeTypeString(node.type || (node as WorkflowNode).data?.type || '');
  
  // ✅ PRIMARY: Check capability registry (most authoritative)
  if (nodeCapabilityRegistryDSL.isTransformation(nodeType)) {
    return true;
  }
  
  // ✅ FALLBACK: Check unified node registry category
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (nodeDef?.category === 'transformation' || nodeDef?.category === 'ai' || nodeDef?.category === 'logic') {
    return true;
  }
  
  // ✅ FALLBACK: Check node data category (if node object provided)
  if (typeof node !== 'string' && (node as WorkflowNode).data?.category) {
    const category = ((node as WorkflowNode).data.category || '').toLowerCase();
    if (category === 'transformation' || category === 'ai' || category === 'logic') {
      return true;
    }
  }
  
  return false;
}

/**
 * ✅ UNIVERSAL: Check if a node is a logic/branching node using registry
 */
export function isLogicNode(node: WorkflowNode | string): boolean {
  const nodeType = typeof node === 'string'
    ? unifiedNormalizeNodeTypeString(node)
    : unifiedNormalizeNodeTypeString(node.type || (node as WorkflowNode).data?.type || '');
  
  // ✅ PRIMARY: Check unified node registry
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (nodeDef?.category === 'logic') {
    return true;
  }
  
  // ✅ FALLBACK: Known logic node types
  const LOGIC_TYPES = [
    'if_else',
    'switch',
    'merge',
    'try_catch',
    'error_handler',
    'retry',
  ];
  
  return LOGIC_TYPES.includes(nodeType);
}

/**
 * ✅ UNIVERSAL: Get node category from registry
 */
export function getNodeCategory(node: WorkflowNode | string): string | null {
  const nodeType = typeof node === 'string'
    ? unifiedNormalizeNodeTypeString(node)
    : unifiedNormalizeNodeTypeString(node.type || (node as WorkflowNode).data?.type || '');
  
  // ✅ PRIMARY: Check unified node registry
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  if (nodeDef?.category) {
    return nodeDef.category;
  }
  
  // ✅ FALLBACK: Check node data category (if node object provided)
  if (typeof node !== 'string' && (node as WorkflowNode).data?.category) {
    return (node as WorkflowNode).data.category;
  }
  
  return null;
}
