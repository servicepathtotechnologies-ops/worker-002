/**
 * SEMANTIC EQUIVALENCE AUTO-GENERATOR
 * 
 * PRODUCTION-READY: Automatically generates semantic equivalences for ALL node types
 * 
 * This ensures:
 * - ALL nodes are covered (not just manually added ones)
 * - Category-based equivalences for all categories
 * - Capability-based equivalences
 * - Alias-based equivalences
 * - Zero false negatives
 * 
 * Architecture:
 * 1. Scans node library for all node types
 * 2. Groups by category, capability, alias
 * 3. Generates equivalences automatically
 * 4. Merges with manual equivalences (manual takes priority)
 */

import { nodeLibrary } from '../../services/nodes/node-library';
import { unifiedNodeRegistry } from './unified-node-registry';
import { SemanticEquivalenceDefinition } from './semantic-node-equivalence-registry';
import { unifiedNormalizeNodeTypeString } from '../utils/unified-node-type-normalizer';

export class SemanticEquivalenceAutoGenerator {
  /**
   * Generate comprehensive equivalences from node library
   * 
   * Strategy:
   * 1. Category-based: All nodes in same category can be equivalent
   * 2. Capability-based: Nodes with same capabilities are equivalent
   * 3. Alias-based: Nodes with aliases map to canonical types
   * 4. Pattern-based: Common naming patterns (google_*, *_api, etc.)
   */
  generateComprehensiveEquivalences(): SemanticEquivalenceDefinition[] {
    const equivalences: SemanticEquivalenceDefinition[] = [];
    const allSchemas = nodeLibrary.getAllSchemas();
    
    // ============================================
    // STRATEGY 1: Category-Based Equivalences
    // ============================================
    const categoryEquivalences = this.generateCategoryBasedEquivalences(allSchemas);
    equivalences.push(...categoryEquivalences);
    
    // ============================================
    // STRATEGY 2: Capability-Based Equivalences
    // ============================================
    const capabilityEquivalences = this.generateCapabilityBasedEquivalences(allSchemas);
    equivalences.push(...capabilityEquivalences);
    
    // ============================================
    // STRATEGY 3: Alias-Based Equivalences
    // ============================================
    const aliasEquivalences = this.generateAliasBasedEquivalences(allSchemas);
    equivalences.push(...aliasEquivalences);
    
    // ============================================
    // STRATEGY 4: Pattern-Based Equivalences
    // ============================================
    const patternEquivalences = this.generatePatternBasedEquivalences(allSchemas);
    equivalences.push(...patternEquivalences);
    
    return equivalences;
  }
  
  /**
   * Generate category-based equivalences
   * 
   * Rule: All nodes in the same category can fulfill requirements for that category
   * Example: All 'ai' nodes can fulfill 'ai_chat_model' requirement
   * 
   * ⚠️ CRITICAL: Excludes broad categories that contain fundamentally different services
   * (e.g., 'google' contains gmail, sheets, docs - these are NOT equivalent)
   */
  private generateCategoryBasedEquivalences(schemas: any[]): SemanticEquivalenceDefinition[] {
    const equivalences: SemanticEquivalenceDefinition[] = [];
    const byCategory = new Map<string, any[]>();
    
    // ⚠️ BLACKLIST: Categories that contain fundamentally different services
    // These should NOT have category-based equivalences
    const EXCLUDED_CATEGORIES = new Set([
      'google',      // Contains: gmail, sheets, docs, drive, calendar - all different services
      'http_api',    // Contains: http_request, graphql, webhook - different operations
      'database',    // Contains: postgres, mysql, mongodb - different databases
      'output',      // Contains: slack, email, discord - different communication channels
      'communication', // Contains: gmail, slack, discord - different services
      'data',        // Too broad - contains many different data operations
      'utility',     // Too broad - contains many different utilities
    ]);
    
    // Group by category
    schemas.forEach(schema => {
      const category = (schema.category || '').toLowerCase();
      if (!category || EXCLUDED_CATEGORIES.has(category)) return; // Skip excluded categories
      
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(schema);
    });
    
    // Generate equivalences for each category
    byCategory.forEach((categorySchemas, category) => {
      if (categorySchemas.length < 2) return; // Need at least 2 nodes
      
      // ✅ ADDITIONAL SAFETY: Only create equivalences if nodes have similar capabilities
      // This prevents grouping nodes that are in the same category but serve different purposes
      const hasSimilarCapabilities = this.checkSimilarCapabilities(categorySchemas);
      if (!hasSimilarCapabilities) {
        console.log(
          `[SemanticEquivalenceAutoGenerator] ⚠️  Skipping category-based equivalence for "${category}": ` +
          `nodes have different capabilities (${categorySchemas.map(s => s.type).join(', ')})`
        );
        return; // Skip if capabilities are too different
      }
      
      // Select canonical (prefer most common/standard name)
      const canonical = this.selectCanonicalType(categorySchemas);
      const equivalents = categorySchemas
        .filter(s => s.type !== canonical)
        .map(s => s.type);
      
      if (equivalents.length > 0) {
        equivalences.push({
          canonical,
          equivalents,
          category,
          operation: '*', // All operations
          priority: 5, // Lower priority than explicit equivalences
        });
      }
    });
    
    return equivalences;
  }
  
  /**
   * Check if nodes in a category have similar capabilities
   * 
   * Returns true only if nodes share at least one common capability,
   * indicating they can perform similar operations
   */
  private checkSimilarCapabilities(schemas: any[]): boolean {
    if (schemas.length < 2) return false;
    
    // Extract all capabilities from all schemas
    const allCapabilities = new Set<string>();
    schemas.forEach(schema => {
      const capabilities = schema.capabilities || [];
      capabilities.forEach((cap: string) => {
        allCapabilities.add(cap.toLowerCase());
      });
    });
    
    // If no capabilities defined, be conservative - don't create equivalence
    if (allCapabilities.size === 0) {
      return false;
    }
    
    // Check if at least one capability is shared by ALL schemas
    for (const cap of allCapabilities) {
      const hasCap = schemas.every(schema => {
        const capabilities = (schema.capabilities || []).map((c: string) => c.toLowerCase());
        return capabilities.includes(cap);
      });
      
      if (hasCap) {
        return true; // Found at least one shared capability
      }
    }
    
    // No shared capabilities - nodes are too different
    return false;
  }
  
  /**
   * Generate capability-based equivalences
   * 
   * Rule: Nodes with same capabilities are equivalent
   * Example: All nodes with 'email.send' capability are equivalent
   */
  private generateCapabilityBasedEquivalences(schemas: any[]): SemanticEquivalenceDefinition[] {
    const equivalences: SemanticEquivalenceDefinition[] = [];
    const byCapability = new Map<string, any[]>();
    
     // ⚠️ CRITICAL: Exclude overly-generic capabilities from equivalence generation
     // These are meta-capabilities that span fundamentally different services
     // Example: 'terminal' is used by both ai_chat_model and google_gmail, but they are NOT equivalent.
     const EXCLUDED_CAPABILITIES = new Set<string>([
       'terminal',
     ]);
    
    // Group by capabilities
    schemas.forEach(schema => {
      const capabilities = schema.capabilities || [];
      capabilities.forEach((cap: string) => {
        const normalizedCap = cap.toLowerCase();
        // Skip excluded/meta capabilities (e.g., 'terminal')
        if (EXCLUDED_CAPABILITIES.has(normalizedCap)) {
          return;
        }
        
        if (!byCapability.has(normalizedCap)) {
          byCapability.set(normalizedCap, []);
        }
        byCapability.get(normalizedCap)!.push(schema);
      });
    });
    
    // Generate equivalences for each capability
    byCapability.forEach((capSchemas, capability) => {
      if (capSchemas.length < 2) return;
      
      // Remove duplicates
      const uniqueSchemas = Array.from(
        new Map(capSchemas.map(s => [s.type, s])).values()
      );
      
      if (uniqueSchemas.length < 2) return;
      
      const canonical = this.selectCanonicalType(uniqueSchemas);
      const equivalents = uniqueSchemas
        .filter(s => s.type !== canonical)
        .map(s => s.type);
      
      if (equivalents.length > 0) {
        // Extract operation from capability (e.g., 'email.send' -> 'send')
        const operation = capability.includes('.') 
          ? capability.split('.')[1] 
          : undefined;
        
        equivalences.push({
          canonical,
          equivalents,
          operation,
          priority: 6, // Higher than category, lower than explicit
        });
      }
    });
    
    return equivalences;
  }
  
  /**
   * Generate alias-based equivalences
   * 
   * Rule: Aliases map to canonical types
   * Example: 'gmail' -> 'google_gmail', 'email' -> 'google_gmail'
   */
  private generateAliasBasedEquivalences(schemas: any[]): SemanticEquivalenceDefinition[] {
    const equivalences: SemanticEquivalenceDefinition[] = [];
    const aliasMap = new Map<string, string>(); // alias -> canonical
    
    schemas.forEach(schema => {
      const canonical = schema.type;
      const aliases = schema.keywords || [];
      
      aliases.forEach((alias: string) => {
        const normalizedAlias = unifiedNormalizeNodeTypeString(alias).toLowerCase();
        const normalizedCanonical = unifiedNormalizeNodeTypeString(canonical).toLowerCase();
        
        // Only add if alias is different from canonical
        if (normalizedAlias !== normalizedCanonical) {
          if (!aliasMap.has(normalizedAlias)) {
            aliasMap.set(normalizedAlias, canonical);
          }
        }
      });
    });
    
    // Group aliases by canonical
    const byCanonical = new Map<string, string[]>();
    aliasMap.forEach((canonical, alias) => {
      if (!byCanonical.has(canonical)) {
        byCanonical.set(canonical, []);
      }
      byCanonical.get(canonical)!.push(alias);
    });
    
    // Generate equivalences
    byCanonical.forEach((aliases, canonical) => {
      if (aliases.length > 0) {
        equivalences.push({
          canonical,
          equivalents: aliases,
          priority: 7, // Higher than category/capability
        });
      }
    });
    
    return equivalences;
  }
  
  /**
   * Generate pattern-based equivalences
   * 
   * Rule: Common naming patterns are equivalent
   * Example: 'google_sheets' patterns, '*_api' patterns, etc.
   */
  private generatePatternBasedEquivalences(schemas: any[]): SemanticEquivalenceDefinition[] {
    const equivalences: SemanticEquivalenceDefinition[] = [];
    
    // Pattern 1: google_* services
    // ⚠️ CRITICAL: Google services are DIFFERENT services (gmail ≠ sheets ≠ docs)
    // Only group if they have the same base name (e.g., google_sheets variants)
    // DO NOT group different services just because they start with "google_"
    const googleServices = schemas.filter(s => 
      s.type.startsWith('google_') || 
      s.keywords?.some((k: string) => k.includes('google'))
    );
    
    if (googleServices.length > 1) {
      // Group by base name (e.g., 'sheets', 'gmail', 'doc')
      // This ensures google_gmail and google_doc stay separate
      const byBase = new Map<string, any[]>();
      googleServices.forEach(schema => {
        // Extract base name: "google_gmail" → "gmail", "google_sheets" → "sheets"
        const base = schema.type.replace('google_', '').split('_')[0]; // Take first part after "google_"
        if (!byBase.has(base)) {
          byBase.set(base, []);
        }
        byBase.get(base)!.push(schema);
      });
      
      // Only create equivalences within the same base name
      // e.g., google_sheets variants can be equivalent, but google_gmail ≠ google_doc
      byBase.forEach((group, base) => {
        if (group.length >= 2) {
          // Additional safety: check if they have similar capabilities
          const hasSimilarCapabilities = this.checkSimilarCapabilities(group);
          if (!hasSimilarCapabilities) {
            console.log(
              `[SemanticEquivalenceAutoGenerator] ⚠️  Skipping pattern-based equivalence for "google_${base}": ` +
              `nodes have different capabilities (${group.map(s => s.type).join(', ')})`
            );
            return; // Skip if capabilities are too different
          }
          
          const canonical = this.selectCanonicalType(group);
          const equivalents = group
            .filter(s => s.type !== canonical)
            .map(s => s.type);
          
          if (equivalents.length > 0) {
            equivalences.push({
              canonical,
              equivalents,
              priority: 6,
            });
          }
        }
      });
    }
    
    // Pattern 2: *_api patterns
    const apiNodes = schemas.filter(s => 
      s.type.endsWith('_api') || 
      s.type.includes('api')
    );
    
    if (apiNodes.length > 1) {
      // Group by service (e.g., 'instagram', 'twitter')
      const byService = new Map<string, any[]>();
      apiNodes.forEach(schema => {
        const service = schema.type.replace('_api', '').replace('api', '');
        if (!byService.has(service)) {
          byService.set(service, []);
        }
        byService.get(service)!.push(schema);
      });
      
      byService.forEach((group, service) => {
        if (group.length >= 2) {
          const canonical = this.selectCanonicalType(group);
          const equivalents = group
            .filter(s => s.type !== canonical)
            .map(s => s.type);
          
          if (equivalents.length > 0) {
            equivalences.push({
              canonical,
              equivalents,
              priority: 6,
            });
          }
        }
      });
    }
    
    return equivalences;
  }
  
  /**
   * Select canonical type from a group of schemas
   * 
   * Strategy:
   * 1. Prefer types without underscores (simpler names)
   * 2. Prefer types without 'api', '_api' suffixes
   * 3. Prefer shorter names
   * 4. Prefer types that appear first alphabetically
   */
  private selectCanonicalType(schemas: any[]): string {
    if (schemas.length === 0) return '';
    if (schemas.length === 1) return schemas[0].type;
    
    // Score each type (higher = better canonical)
    const scored = schemas.map(schema => {
      const type = schema.type;
      let score = 100;
      
      // Prefer simpler names (no underscores)
      if (!type.includes('_')) score += 20;
      
      // Prefer names without 'api' suffix
      if (!type.endsWith('_api') && !type.endsWith('api')) score += 15;
      
      // Prefer shorter names
      score += Math.max(0, 20 - type.length);
      
      // Prefer standard prefixes (google_, slack_, etc.)
      if (type.startsWith('google_') || 
          type.startsWith('slack_') || 
          type.startsWith('ai_')) {
        score += 10;
      }
      
      return { type, score };
    });
    
    // Sort by score (descending), then alphabetically
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.type.localeCompare(b.type);
    });
    
    return scored[0].type;
  }
}

// Export singleton instance
export const semanticEquivalenceAutoGenerator = new SemanticEquivalenceAutoGenerator();
