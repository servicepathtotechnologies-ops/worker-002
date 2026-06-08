import { BuildMode, BuildModeManager, buildModeManager } from '../build-modes';

describe('BuildModeManager', () => {
  let manager: BuildModeManager;

  beforeEach(() => {
    manager = new BuildModeManager();
  });

  it('returns safe mode config by default', () => {
    expect(manager.getConfig()).toEqual({
      mode: BuildMode.SAFE,
      skipLiveTest: false,
      skipRuntimeSimulation: false,
      maxValidationLayers: 5,
      requirePatternMatch: false,
      allowPartialBuild: false,
      description: 'Maximum validation and testing. Slower but more reliable.',
    });
  });

  it('returns safe mode config when safe mode is requested', () => {
    expect(manager.getConfig(BuildMode.SAFE)).toMatchObject({
      mode: BuildMode.SAFE,
      skipLiveTest: false,
      skipRuntimeSimulation: false,
      requirePatternMatch: false,
      allowPartialBuild: false,
    });
  });

  it('returns fast mode config with runtime checks skipped', () => {
    expect(manager.getConfig(BuildMode.FAST)).toEqual({
      mode: BuildMode.FAST,
      skipLiveTest: true,
      skipRuntimeSimulation: true,
      maxValidationLayers: 3,
      requirePatternMatch: true,
      allowPartialBuild: true,
      description: 'Pattern-based fast build. Skips live testing. For advanced users.',
    });
  });

  it('allows safe mode for complex workflows', () => {
    expect(manager.validateMode(BuildMode.SAFE, 'complex')).toEqual({
      valid: true,
    });
  });

  it('allows fast mode for simple and medium workflows', () => {
    expect(manager.validateMode(BuildMode.FAST, 'simple')).toEqual({ valid: true });
    expect(manager.validateMode(BuildMode.FAST, 'medium')).toEqual({ valid: true });
  });

  it('rejects fast mode for complex workflows with a safe-mode recommendation', () => {
    expect(manager.validateMode(BuildMode.FAST, 'complex')).toEqual({
      valid: false,
      recommendation: BuildMode.SAFE,
      reason: 'Fast mode is not recommended for complex workflows. Use Safe mode for better reliability.',
    });
  });

  it('exports a singleton manager with the same config behavior', () => {
    expect(buildModeManager.getConfig(BuildMode.FAST)).toMatchObject({
      mode: BuildMode.FAST,
      skipLiveTest: true,
      requirePatternMatch: true,
    });
  });
});
