// PHASE-2: Safe Mode vs Fast Mode
// Two build modes with different validation levels

export enum BuildMode {
  SAFE = 'safe', // Default: Max validation, live test, slower
  FAST = 'fast', // Pattern-only, skip live test, for advanced users
}

export interface BuildModeConfig {
  mode: BuildMode;
  skipLiveTest: boolean;
  skipRuntimeSimulation: boolean;
  maxValidationLayers: number;
  requirePatternMatch: boolean;
  allowPartialBuild: boolean;
  description: string;
}

/**
 * Build Modes - PHASE-2 Feature #10
 * 
 * Two build modes:
 * 🔒 Safe Mode (Default): Max validation, live test, slower
 * ⚡ Fast Mode: Pattern-only, skip live test, for advanced users
 */
export class BuildModeManager {
  private readonly SAFE_MODE: BuildModeConfig = {
    mode: BuildMode.SAFE,
    skipLiveTest: false,
    skipRuntimeSimulation: false,
    maxValidationLayers: 5, // All layers
    requirePatternMatch: false,
    allowPartialBuild: false,
    description: 'Maximum validation and testing. Slower but more reliable.',
  };

  private readonly FAST_MODE: BuildModeConfig = {
    mode: BuildMode.FAST,
    skipLiveTest: true,
    skipRuntimeSimulation: true,
    maxValidationLayers: 3, // Only structural, config, credentials
    requirePatternMatch: true, // Must have pattern match
    allowPartialBuild: true, // Allow partial builds
    description: 'Pattern-based fast build. Skips live testing. For advanced users.',
  };

  /**
   * Get build mode configuration
   */
  getConfig(mode: BuildMode = BuildMode.SAFE): BuildModeConfig {
    return mode === BuildMode.FAST ? this.FAST_MODE : this.SAFE_MODE;
  }

  /**
   * Validate if mode is appropriate for workflow
   */
  validateMode(mode: BuildMode, workflowComplexity: 'simple' | 'medium' | 'complex'): {
    valid: boolean;
    recommendation?: BuildMode;
    reason?: string;
  } {
    // Fast mode not recommended for complex workflows
    if (mode === BuildMode.FAST && workflowComplexity === 'complex') {
      return {
        valid: false,
        recommendation: BuildMode.SAFE,
        reason: 'Fast mode is not recommended for complex workflows. Use Safe mode for better reliability.',
      };
    }

    return { valid: true };
  }
}

// Export singleton instance
export const buildModeManager = new BuildModeManager();
