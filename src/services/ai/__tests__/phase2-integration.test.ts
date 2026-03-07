/**
 * Phase 2 Integration Tests
 * 
 * Tests the complete Phase 2 flow: Extract → Validate → Repair
 */

import { intentExtractor } from '../intent-extractor';
import { intentValidator } from '../intent-validator';
import { intentRepairEngine } from '../intent-repair-engine';
import { fallbackIntentGenerator } from '../fallback-intent-generator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';

describe('Phase 2 Integration', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    unifiedNodeRegistry.getAllTypes();
  });
  
  it('should complete full flow: Extract → Validate → Repair', async () => {
    const prompt = 'Send email from Gmail to Slack when new message arrives';
    
    // Step 1: Extract
    const extractionResult = await intentExtractor.extractIntent(prompt);
    expect(extractionResult.intent).toBeDefined();
    
    // Step 2: Validate
    const validationResult = intentValidator.validate(extractionResult.intent);
    
    // Step 3: Repair if needed
    let finalIntent = extractionResult.intent;
    if (!validationResult.valid) {
      const repairResult = intentRepairEngine.repair(extractionResult.intent, validationResult, prompt);
      finalIntent = repairResult.repairedIntent;
    }
    
    // Final validation
    const finalValidation = intentValidator.validate(finalIntent);
    expect(finalValidation.valid).toBe(true);
  });
  
  it('should handle incomplete intent and repair it', async () => {
    const prompt = 'Send to Slack'; // Missing source
    
    // Extract
    const extractionResult = await intentExtractor.extractIntent(prompt);
    
    // Validate (should fail)
    const validationResult = intentValidator.validate(extractionResult.intent);
    expect(validationResult.valid).toBe(false);
    
    // Repair
    const repairResult = intentRepairEngine.repair(extractionResult.intent, validationResult, prompt);
    
    // Should have repairs
    expect(repairResult.repairs.length).toBeGreaterThan(0);
    
    // Final validation should pass or be better
    const finalValidation = intentValidator.validate(repairResult.repairedIntent);
    expect(finalValidation.errors.length).toBeLessThan(validationResult.errors.length);
  });
  
  it('should use registry for all operations (UNIVERSAL)', async () => {
    // Get a random node type from registry
    const allTypes = unifiedNodeRegistry.getAllTypes();
    const testNodeType = allTypes[Math.floor(Math.random() * allTypes.length)];
    const nodeDef = unifiedNodeRegistry.get(testNodeType);
    
    if (nodeDef) {
      const label = nodeDef.label || testNodeType;
      const prompt = `Use ${label} to send data`;
      
      // Extract
      const extractionResult = await intentExtractor.extractIntent(prompt);
      
      // Should find the node from registry (not hardcoded)
      const foundInSources = extractionResult.intent.sources.some(s => 
        s.toLowerCase().includes(label.toLowerCase())
      );
      const foundInDestinations = extractionResult.intent.destinations.some(d => 
        d.toLowerCase().includes(label.toLowerCase())
      );
      
      expect(foundInSources || foundInDestinations).toBe(true);
    }
  });
  
  it('should work with fallback generator when LLM unavailable', () => {
    const prompt = 'Send email from Gmail to Slack';
    
    // Use fallback directly
    const result = fallbackIntentGenerator.generateFromPrompt(prompt);
    
    expect(result.intent.verbs.length).toBeGreaterThan(0);
    expect(result.intent.sources.length + result.intent.destinations.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });
  
  it('should normalize entity names consistently', async () => {
    const prompt1 = 'Send from google gmail to slack';
    const prompt2 = 'Send from Gmail to Slack';
    
    const result1 = await intentExtractor.extractIntent(prompt1);
    const result2 = await intentExtractor.extractIntent(prompt2);
    
    // Repair both to normalize
    const validation1 = intentValidator.validate(result1.intent);
    const validation2 = intentValidator.validate(result2.intent);
    
    const repair1 = intentRepairEngine.repair(result1.intent, validation1);
    const repair2 = intentRepairEngine.repair(result2.intent, validation2);
    
    // Normalized names should be consistent (using registry labels)
    const sources1 = repair1.repairedIntent.sources || [];
    const sources2 = repair2.repairedIntent.sources || [];
    
    // Both should normalize to registry labels
    const allTypes = unifiedNodeRegistry.getAllTypes();
    const isValidSource1 = sources1.some(s => 
      allTypes.some(type => {
        const def = unifiedNodeRegistry.get(type);
        return def?.label === s;
      })
    );
    const isValidSource2 = sources2.some(s => 
      allTypes.some(type => {
        const def = unifiedNodeRegistry.get(type);
        return def?.label === s;
      })
    );
    
    expect(isValidSource1).toBe(true);
    expect(isValidSource2).toBe(true);
  });
  
  it('should handle complex prompts with multiple entities', async () => {
    const prompt = 'Read data from Google Sheets, summarize it, filter results, and send to Slack and Discord';
    
    const result = await intentExtractor.extractIntent(prompt);
    
    expect(result.intent.verbs.length).toBeGreaterThan(1);
    expect(result.intent.sources.length).toBeGreaterThan(0);
    expect(result.intent.destinations.length).toBeGreaterThan(1);
    expect(result.intent.transformations?.length).toBeGreaterThan(0);
  });
  
  it('should validate completeness score improves after repair', async () => {
    const prompt = 'Send email'; // Incomplete
    
    const extractionResult = await intentExtractor.extractIntent(prompt);
    const initialScore = intentValidator.getCompletenessScore(extractionResult.intent);
    
    const validationResult = intentValidator.validate(extractionResult.intent);
    const repairResult = intentRepairEngine.repair(extractionResult.intent, validationResult, prompt);
    
    const finalScore = intentValidator.getCompletenessScore(repairResult.repairedIntent);
    
    expect(finalScore).toBeGreaterThanOrEqual(initialScore);
  });
});
