/**
 * ✅ WORLD-CLASS: Feature Flags - Registry-Only Mode
 * 
 * ✅ LEGACY EXECUTOR REMOVED: All 70+ nodes migrated to UnifiedNodeRegistry
 * - Registry-only mode is PERMANENT (always true)
 * - Legacy fallback is PERMANENTLY DISABLED (removed)
 * - No environment variable overrides (world-class production system)
 * 
 * Architecture:
 * - All nodes execute via UnifiedNodeRegistry
 * - Legacy executor only accessible through adapter (executeViaLegacyExecutor)
 * - No direct fallback paths
 */

export interface FeatureFlags {
  USE_REGISTRY_EXECUTOR: boolean; // Always true - cannot be disabled
  STRICT_REGISTRY_VALIDATION: boolean; // Always true - production-grade
}

/**
 * Get feature flags - world-class production defaults
 * 
 * ✅ PERMANENT: Registry-only mode (cannot be disabled)
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    // ✅ PERMANENT: Always true - registry-only mode
    USE_REGISTRY_EXECUTOR: true,
    
    // ✅ PERMANENT: Always true - strict validation
    STRICT_REGISTRY_VALIDATION: true,
  };
}

/**
 * Check if registry executor should be used exclusively
 * 
 * ✅ ALWAYS TRUE: Registry-only mode is permanent
 */
export function shouldUseRegistryExecutor(): boolean {
  return true; // Always true - no fallback
}
