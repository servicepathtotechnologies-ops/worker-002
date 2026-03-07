/**
 * Capability-Based Intent Coverage Validator
 * 
 * Validates intent coverage by matching required capabilities (read, transform, write)
 * to DSL node capabilities instead of matching node types directly.
 * 
 * Architecture:
 * - Intent actions → required capabilities
 * - DSL nodes → provided capabilities
 * - Validation: all required capabilities must be satisfied
 * 
 * Benefits:
 * - Extensible: add new capabilities without changing validation logic
 * - Flexible: nodes can satisfy multiple capabilities
 * - Semantic: validation based on what nodes can DO, not what they're CALLED
 */

import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';
import { StructuredIntent } from './intent-structurer';
import { WorkflowDSL, DSLDataSource, DSLTransformation, DSLOutput } from './workflow-dsl';

/**
 * Core capabilities that intent actions require
 */
export enum RequiredCapability {
  READ = 'read',           // Read/fetch data
  TRANSFORM = 'transform', // Transform/process data
  WRITE = 'write',         // Write/send data
}

/**
 * Capability requirement from an intent action
 */
export interface CapabilityRequirement {
  capability: RequiredCapability;
  intentAction: {
    type: string;
    operation: string;
  };
  requiredCapabilities: string[]; // Specific capabilities needed (e.g., ['read_data'], ['summarize', 'transformation'])
}

/**
 * Capability provider from a DSL node
 */
export interface CapabilityProvider {
  nodeType: string;
  category: 'dataSource' | 'transformation' | 'output';
  providedCapabilities: string[]; // Capabilities this node provides
}

/**
 * Capability coverage result
 */
export interface CapabilityCoverageResult {
  requirement: CapabilityRequirement;
  satisfied: boolean;
  providers: CapabilityProvider[]; // DSL nodes that satisfy this requirement
  missingCapabilities: string[]; // Capabilities not satisfied
  confidence: number; // 0.0 to 1.0
}

/**
 * Operation to capability mapping
 */
const OPERATION_TO_CAPABILITY: Record<string, RequiredCapability> = {
  // Read operations
  'read': RequiredCapability.READ,
  'fetch': RequiredCapability.READ,
  'get': RequiredCapability.READ,
  'query': RequiredCapability.READ,
  'retrieve': RequiredCapability.READ,
  'pull': RequiredCapability.READ,
  'list': RequiredCapability.READ,
  
  // Transformation operations
  'summarize': RequiredCapability.TRANSFORM,
  'summarise': RequiredCapability.TRANSFORM,
  'analyze': RequiredCapability.TRANSFORM,
  'analyse': RequiredCapability.TRANSFORM,
  'process': RequiredCapability.TRANSFORM,
  'transform': RequiredCapability.TRANSFORM,
  'format': RequiredCapability.TRANSFORM,
  'parse': RequiredCapability.TRANSFORM,
  'filter': RequiredCapability.TRANSFORM,
  'merge': RequiredCapability.TRANSFORM,
  'extract': RequiredCapability.TRANSFORM,
  'classify': RequiredCapability.TRANSFORM,
  'translate': RequiredCapability.TRANSFORM,
  
  // Write operations
  'send': RequiredCapability.WRITE,
  'write': RequiredCapability.WRITE,
  'create': RequiredCapability.WRITE,
  'update': RequiredCapability.WRITE,
  'notify': RequiredCapability.WRITE,
  'post': RequiredCapability.WRITE,
  'publish': RequiredCapability.WRITE,
  'store': RequiredCapability.WRITE,
  'save': RequiredCapability.WRITE,
  'append': RequiredCapability.WRITE,
};

/**
 * Map operation to specific capability strings
 * 
 * ✅ ROOT-LEVEL FIX: Checks node type to determine if it's a transformation node
 * Transformation nodes (like ai_chat_model) should use TRANSFORM capability even with "create" operation
 */
function mapOperationToCapabilities(operation: string, intentType: string): string[] {
  const op = operation.toLowerCase();
  const type = intentType.toLowerCase();
  const capabilities: string[] = [];
  
  // ✅ ROOT-LEVEL FIX: Check if this is a transformation node type
  // Transformation nodes should use TRANSFORM capability regardless of operation
  const isTransformationNode = nodeCapabilityRegistryDSL.isTransformation(type);
  if (isTransformationNode) {
    capabilities.push('transformation', 'ai_processing');
    // Add specific transformation capabilities based on node type
    if (type.includes('summar') || type.includes('summariz')) {
      capabilities.push('summarize');
    } else if (type.includes('analyz') || type.includes('analyse')) {
      capabilities.push('analyze', 'ai_processing');
    } else if (type.includes('chat') || type.includes('llm') || type.includes('gpt') || type.includes('claude') || type.includes('gemini')) {
      capabilities.push('llm', 'ai_processing', 'transformation');
    }
    return capabilities; // Return early - transformation nodes don't need output/write capabilities
  }
  
  // Map to core capability
  const coreCapability = OPERATION_TO_CAPABILITY[op];
  if (coreCapability === RequiredCapability.READ) {
    capabilities.push('read_data', 'data_source');
  } else if (coreCapability === RequiredCapability.TRANSFORM) {
    capabilities.push('transformation', 'ai_processing');
    // Add specific transformation capabilities
    if (op === 'summarize' || op === 'summarise') {
      capabilities.push('summarize');
    } else if (op === 'analyze' || op === 'analyse') {
      capabilities.push('analyze', 'ai_processing');
    } else if (op === 'process') {
      capabilities.push('transform', 'process');
    }
  } else if (coreCapability === RequiredCapability.WRITE) {
    capabilities.push('output', 'write_data');
    // Add specific output capabilities
    if (op === 'send' && (type.includes('email') || type.includes('gmail'))) {
      capabilities.push('send_email');
    } else if (op === 'notify') {
      capabilities.push('notification');
    } else if (op === 'post' || op === 'create') {
      // Social media posts
      if (type.includes('twitter') || type.includes('linkedin') || type.includes('instagram') || 
          type.includes('facebook') || type.includes('social')) {
        capabilities.push('send_post', 'social_media');
      }
    }
  }
  
  return capabilities;
}

/**
 * Extract capability requirements from intent actions
 * 
 * ✅ ROOT-LEVEL FIX: Transformation nodes use TRANSFORM capability regardless of operation
 */
export function extractCapabilityRequirements(intent: StructuredIntent): CapabilityRequirement[] {
  const requirements: CapabilityRequirement[] = [];
  
  if (!intent.actions || intent.actions.length === 0) {
    return requirements;
  }
  
  for (const action of intent.actions) {
    const operation = (action.operation || '').toLowerCase();
    const type = (action.type || '').toLowerCase();
    
    if (!operation) {
      continue;
    }
    
    // ✅ ROOT-LEVEL FIX: Check if this is a transformation node type first
    // Transformation nodes should use TRANSFORM capability regardless of operation
    const isTransformationNode = nodeCapabilityRegistryDSL.isTransformation(type);
    let coreCapability: RequiredCapability;
    
    if (isTransformationNode) {
      // Force transformation nodes to use TRANSFORM capability
      coreCapability = RequiredCapability.TRANSFORM;
    } else {
      // Map operation to core capability for non-transformation nodes
      coreCapability = OPERATION_TO_CAPABILITY[operation];
      if (!coreCapability) {
        continue; // Unknown operation
      }
    }
    
    // Get specific capabilities needed
    const requiredCapabilities = mapOperationToCapabilities(operation, action.type);
    
    requirements.push({
      capability: coreCapability,
      intentAction: {
        type: action.type,
        operation: action.operation || operation,
      },
      requiredCapabilities,
    });
  }
  
  return requirements;
}

/**
 * Extract capability providers from DSL nodes
 */
export function extractCapabilityProviders(dsl: WorkflowDSL): CapabilityProvider[] {
  const providers: CapabilityProvider[] = [];
  
  // Extract from data sources
  for (const ds of dsl.dataSources) {
    const nodeType = ds.type.toLowerCase();
    const capabilities = nodeCapabilityRegistryDSL.getCapabilities(nodeType);
    
    providers.push({
      nodeType: ds.type,
      category: 'dataSource',
      providedCapabilities: capabilities,
    });
  }
  
  // Extract from transformations
  for (const tf of dsl.transformations) {
    const nodeType = tf.type.toLowerCase();
    const capabilities = nodeCapabilityRegistryDSL.getCapabilities(nodeType);
    
    providers.push({
      nodeType: tf.type,
      category: 'transformation',
      providedCapabilities: capabilities,
    });
  }
  
  // Extract from outputs
  for (const out of dsl.outputs) {
    const nodeType = out.type.toLowerCase();
    const capabilities = nodeCapabilityRegistryDSL.getCapabilities(nodeType);
    
    providers.push({
      nodeType: out.type,
      category: 'output',
      providedCapabilities: capabilities,
    });
  }
  
  return providers;
}

/**
 * Check if a capability requirement is satisfied by providers
 * 
 * ✅ ROOT-LEVEL FIX: Handles capability equivalence and category-aware validation
 */
function checkCapabilityCoverage(
  requirement: CapabilityRequirement,
  providers: CapabilityProvider[]
): CapabilityCoverageResult {
  const matchingProviders: CapabilityProvider[] = [];
  const satisfiedCapabilities: Set<string> = new Set();
  const missingCapabilities: string[] = [];
  
  // ✅ ROOT-LEVEL FIX: Capability equivalence mapping
  // Some capabilities are equivalent (e.g., send_post = write_data, output = write_data for outputs)
  const capabilityEquivalents: Record<string, string[]> = {
    'write_data': ['send_post', 'send_email', 'send_message', 'write_crm', 'output'],
    'output': ['send_post', 'send_email', 'send_message', 'write_crm', 'write_data'],
    'transformation': ['ai_processing', 'transform', 'summarize', 'analyze', 'llm'],
    'ai_processing': ['transformation', 'transform', 'llm'],
  };
  
  // Check each required capability
  for (const requiredCap of requirement.requiredCapabilities) {
    const requiredCapLower = requiredCap.toLowerCase();
    let found = false;
    
    // Get equivalent capabilities
    const equivalents = capabilityEquivalents[requiredCapLower] || [];
    const allPossibleCaps = [requiredCapLower, ...equivalents.map(e => e.toLowerCase())];
    
    // Find providers that have this capability (or equivalent)
    for (const provider of providers) {
      const providerCaps = provider.providedCapabilities.map(c => c.toLowerCase());
      
      // ✅ ROOT-LEVEL FIX: Check if provider category matches requirement
      // Transformation nodes don't need output/write_data - they need transformation capabilities
      if (requirement.capability === RequiredCapability.TRANSFORM && provider.category === 'transformation') {
        // For transformation requirements, check if provider has transformation capabilities
        const hasTransformationCap = providerCaps.some(cap => 
          ['transformation', 'ai_processing', 'transform', 'llm', 'summarize', 'analyze'].includes(cap)
        );
        if (hasTransformationCap) {
          if (!matchingProviders.some(p => p.nodeType === provider.nodeType)) {
            matchingProviders.push(provider);
          }
          satisfiedCapabilities.add(requiredCap);
          found = true;
          break; // Found matching transformation provider
        }
      }
      
      // ✅ ROOT-LEVEL FIX: For write requirements, only check output category nodes
      if (requirement.capability === RequiredCapability.WRITE && provider.category !== 'output') {
        continue; // Skip non-output nodes for write requirements
      }
      
      // Check exact match or equivalent
      const hasCapability = allPossibleCaps.some(cap => providerCaps.includes(cap));
      
      if (hasCapability) {
        if (!matchingProviders.some(p => p.nodeType === provider.nodeType)) {
          matchingProviders.push(provider);
        }
        satisfiedCapabilities.add(requiredCap);
        found = true;
      }
      // Check substring match
      else if (providerCaps.some(cap => 
        allPossibleCaps.some(reqCap => 
          cap.includes(reqCap) || reqCap.includes(cap)
        )
      )) {
        if (!matchingProviders.some(p => p.nodeType === provider.nodeType)) {
          matchingProviders.push(provider);
        }
        satisfiedCapabilities.add(requiredCap);
        found = true;
      }
    }
    
    if (!found) {
      missingCapabilities.push(requiredCap);
    }
  }
  
  // Calculate confidence based on how many capabilities are satisfied
  const confidence = requirement.requiredCapabilities.length > 0
    ? satisfiedCapabilities.size / requirement.requiredCapabilities.length
    : 0;
  
  const satisfied = missingCapabilities.length === 0 && matchingProviders.length > 0;
  
  return {
    requirement,
    satisfied,
    providers: matchingProviders,
    missingCapabilities,
    confidence,
  };
}

/**
 * Validate intent coverage by capabilities
 * 
 * @param intent - Structured intent
 * @param dsl - Generated workflow DSL
 * @returns Validation result with coverage details
 */
export function validateIntentCoverageByCapabilities(
  intent: StructuredIntent,
  dsl: WorkflowDSL
): {
  valid: boolean;
  coverageResults: CapabilityCoverageResult[];
  missingRequirements: CapabilityRequirement[];
  errors: string[];
} {
  const errors: string[] = [];
  const missingRequirements: CapabilityRequirement[] = [];
  
  // Extract capability requirements from intent
  const requirements = extractCapabilityRequirements(intent);
  
  if (requirements.length === 0) {
    return {
      valid: true,
      coverageResults: [],
      missingRequirements: [],
      errors: [],
    };
  }
  
  // Extract capability providers from DSL
  const providers = extractCapabilityProviders(dsl);
  
  // Check coverage for each requirement
  const coverageResults: CapabilityCoverageResult[] = [];
  
  for (const requirement of requirements) {
    const coverage = checkCapabilityCoverage(requirement, providers);
    coverageResults.push(coverage);
    
    if (!coverage.satisfied) {
      missingRequirements.push(requirement);
      
      const missingCaps = coverage.missingCapabilities.join(', ');
      const availableProviders = providers.map(p => p.nodeType).join(', ') || 'none';
      
      errors.push(
        `Intent action "${requirement.intentAction.type}" (operation: "${requirement.intentAction.operation}") ` +
        `requires capabilities: ${requirement.requiredCapabilities.join(', ')}, ` +
        `but missing: ${missingCaps}. ` +
        `Available DSL nodes: ${availableProviders}`
      );
    }
  }
  
  return {
    valid: missingRequirements.length === 0,
    coverageResults,
    missingRequirements,
    errors,
  };
}
