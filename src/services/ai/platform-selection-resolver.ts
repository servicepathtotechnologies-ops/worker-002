/**
 * ✅ ROOT-LEVEL: Platform Selection Resolver
 * 
 * When user says "CRM" or "email" without specifying platform,
 * AI MUST ask which platform they want before generating workflow.
 * 
 * Architecture Rules:
 * 1. If user says "CRM" → Ask: "Which CRM? HubSpot, Salesforce, Zoho, or Pipedrive?"
 * 2. If user says "email" → Ask: "Which email? Gmail, Outlook, or generic email?"
 * 3. If user specifies platform → Use that platform only
 * 4. Prevent duplicate platforms in same workflow
 */

export interface PlatformGroup {
  category: string;
  platforms: string[];
  nodeTypes: string[];
}

export const PLATFORM_GROUPS: PlatformGroup[] = [
  {
    category: 'CRM',
    platforms: ['HubSpot', 'Salesforce', 'Zoho', 'Pipedrive'],
    nodeTypes: ['hubspot', 'salesforce', 'zoho_crm', 'pipedrive'],
  },
  {
    category: 'Email',
    platforms: ['Gmail', 'Outlook', 'Generic Email'],
    nodeTypes: ['google_gmail', 'outlook', 'email'],
  },
  {
    category: 'Messaging',
    platforms: ['Slack', 'Discord', 'Telegram', 'Teams'],
    nodeTypes: ['slack_message', 'discord', 'telegram', 'microsoft_teams'],
  },
  {
    category: 'Database',
    platforms: ['PostgreSQL', 'MySQL', 'MongoDB', 'Supabase'],
    nodeTypes: ['postgresql', 'mysql', 'mongodb', 'supabase'],
  },
  {
    category: 'Sheets',
    platforms: ['Google Sheets', 'Airtable'],
    nodeTypes: ['google_sheets', 'airtable'],
  },
];

export interface PlatformSelectionResult {
  needsClarification: boolean;
  question?: string;
  selectedPlatform?: string;
  selectedNodeType?: string;
  ambiguousCategories?: string[];
}

/**
 * ✅ ROOT-LEVEL: Platform Selection Resolver
 * 
 * Detects ambiguous platform mentions and requires clarification
 */
export class PlatformSelectionResolver {
  /**
   * Analyze user prompt for platform ambiguity
   * 
   * Returns:
   * - needsClarification: true if platform is ambiguous
   * - question: Question to ask user
   * - selectedPlatform: If user specified platform
   * - selectedNodeType: Canonical node type
   */
  analyzePlatformSelection(userPrompt: string): PlatformSelectionResult {
    const promptLower = userPrompt.toLowerCase();
    const ambiguousCategories: string[] = [];
    const selectedPlatforms: Map<string, string> = new Map(); // category -> nodeType
    
    // Check each platform group
    for (const group of PLATFORM_GROUPS) {
      // Check if user mentioned category (e.g., "CRM", "email")
      const mentionedCategory = group.platforms.some(platform => 
        promptLower.includes(platform.toLowerCase())
      ) || promptLower.includes(group.category.toLowerCase());
      
      if (!mentionedCategory) {
        continue; // Category not mentioned
      }
      
      // Check which specific platforms user mentioned
      const mentionedPlatforms: string[] = [];
      for (let i = 0; i < group.platforms.length; i++) {
        const platform = group.platforms[i];
        const nodeType = group.nodeTypes[i];
        
        if (promptLower.includes(platform.toLowerCase()) || 
            promptLower.includes(nodeType.toLowerCase()) ||
            promptLower.includes(nodeType.replace('_', ' ').toLowerCase())) {
          mentionedPlatforms.push(platform);
          selectedPlatforms.set(group.category, nodeType);
        }
      }
      
      // If category mentioned but no specific platform → ambiguous
      if (mentionedPlatforms.length === 0) {
        ambiguousCategories.push(group.category);
      } else if (mentionedPlatforms.length > 1) {
        // Multiple platforms mentioned → ambiguous (user must choose one)
        ambiguousCategories.push(group.category);
      }
    }
    
    // If ambiguous, return question
    if (ambiguousCategories.length > 0) {
      const questions = ambiguousCategories.map(category => {
        const group = PLATFORM_GROUPS.find(g => g.category === category);
        if (!group) return '';
        
        return `Which ${category} platform do you want to use? ${group.platforms.join(', ')}`;
      });
      
      return {
        needsClarification: true,
        question: questions.join('\n'),
        ambiguousCategories,
      };
    }
    
    // If specific platform selected, return it
    if (selectedPlatforms.size > 0) {
      const firstSelection = Array.from(selectedPlatforms.entries())[0];
      return {
        needsClarification: false,
        selectedPlatform: firstSelection[0],
        selectedNodeType: firstSelection[1],
      };
    }
    
    // No platform mentioned
    return {
      needsClarification: false,
    };
  }
  
  /**
   * Check if workflow has duplicate platforms
   * 
   * Returns nodes that do the same operation
   */
  checkDuplicatePlatforms(nodes: Array<{ type: string; data?: { type?: string } }>): {
    hasDuplicates: boolean;
    duplicates: Array<{ nodeType: string; operation: string; nodes: string[] }>;
  } {
    const operationGroups = new Map<string, string[]>(); // operation -> nodeTypes
    
    for (const node of nodes) {
      const nodeType = node.data?.type || node.type;
      const operation = this.getNodeOperation(nodeType);
      
      if (!operationGroups.has(operation)) {
        operationGroups.set(operation, []);
      }
      operationGroups.get(operation)!.push(nodeType);
    }
    
    const duplicates: Array<{ nodeType: string; operation: string; nodes: string[] }> = [];
    
    for (const [operation, nodeTypes] of operationGroups.entries()) {
      if (nodeTypes.length > 1) {
        // Multiple nodes doing same operation
        duplicates.push({
          nodeType: nodeTypes[0],
          operation,
          nodes: nodeTypes,
        });
      }
    }
    
    return {
      hasDuplicates: duplicates.length > 0,
      duplicates,
    };
  }
  
  /**
   * Get operation category for node type
   */
  private getNodeOperation(nodeType: string): string {
    for (const group of PLATFORM_GROUPS) {
      if (group.nodeTypes.includes(nodeType)) {
        return group.category.toLowerCase();
      }
    }
    
    // Each node type is its own operation by default
    return nodeType;
  }
  
  /**
   * Auto-select default platforms for ambiguous categories
   * 
   * Defaults:
   * - CRM → HubSpot (most popular)
   * - Email → Gmail (most common)
   * - Messaging → Slack (most popular)
   * - Database → PostgreSQL (most common)
   * - Sheets → Google Sheets (most common)
   */
  autoSelectDefaults(categories: string[]): Array<{ category: string; platform: string; nodeType: string }> {
    const defaults: Array<{ category: string; platform: string; nodeType: string }> = [];
    
    const defaultMap: Record<string, { platform: string; nodeType: string }> = {
      'CRM': { platform: 'HubSpot', nodeType: 'hubspot' },
      'Email': { platform: 'Gmail', nodeType: 'google_gmail' },
      'Messaging': { platform: 'Slack', nodeType: 'slack_message' },
      'Database': { platform: 'PostgreSQL', nodeType: 'postgresql' },
      'Sheets': { platform: 'Google Sheets', nodeType: 'google_sheets' },
    };
    
    for (const category of categories) {
      const defaultSelection = defaultMap[category];
      if (defaultSelection) {
        defaults.push({
          category,
          platform: defaultSelection.platform,
          nodeType: defaultSelection.nodeType,
        });
      }
    }
    
    return defaults;
  }
}

// Export singleton instance
export const platformSelectionResolver = new PlatformSelectionResolver();
