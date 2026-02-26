// Question Formatter
// Converts technical node choices to user-friendly questions

import { NodeOption, MultiNodeDetectionResult } from './node-equivalence-mapper';

export interface DisplayOption {
  value: string;
  label: string;
  icon: string;
  description: string;
  pros: string[];
  cons: string[];
  bestFor: string[];
  complexity: 'low' | 'medium' | 'high';
}

export interface FormattedQuestion {
  question: string;
  explanation: string;
  options: DisplayOption[];
  recommendation?: string;
  considerations: string[];
}

/**
 * QuestionFormatter - Converts technical node choices to user-friendly questions
 */
export class QuestionFormatter {
  /**
   * Format node choice question for user display
   */
  formatNodeChoiceQuestion(
    category: string,
    options: NodeOption[],
    userPrompt?: string
  ): FormattedQuestion {
    const baseQuestion = this.getBaseQuestion(category, userPrompt);
    
    return {
      question: baseQuestion,
      explanation: this.getCategoryExplanation(category),
      options: this.formatOptionsForDisplay(options),
      recommendation: this.getRecommendation(category, options),
      considerations: this.getConsiderations(category)
    };
  }
  
  /**
   * Format options for display - Simplified, brief labels only
   */
  private formatOptionsForDisplay(options: NodeOption[]): DisplayOption[] {
    return options.map(option => ({
      value: option.id,
      label: this.getUserFriendlyLabel(option.name), // Just the name, no descriptions
      icon: option.icon,
      description: "", // No descriptions
      pros: [], // Removed
      cons: [], // Removed
      bestFor: [], // Removed
      complexity: 'low' // Simplified
    }));
  }
  
  /**
   * Get base question text for category - Simplified, shorter questions
   */
  private getBaseQuestion(category: string, userPrompt?: string): string {
    const templates: Record<string, string> = {
      notification: "How to send notifications?",
      database: "Where to store data?",
      file_storage: "Where to store files?",
      authentication: "How to authenticate?",
      // ✅ CRITICAL: Use same wording as workflow-analyzer to prevent duplicates
      // Changed from "When should this workflow run?" to match "How should this workflow be triggered?"
      scheduling: "How should this workflow be triggered?"
    };
    
    return templates[category] || `How to handle ${category}?`;
  }
  
  /**
   * Get category explanation - Simplified, only essential info
   */
  private getCategoryExplanation(category: string): string {
    // Return empty - no long explanations needed
    return "";
  }
  
  /**
   * Get recommendation - Simplified, removed long recommendations
   */
  private getRecommendation(category: string, options: NodeOption[]): string {
    // Return empty - no recommendations needed
    return "";
  }
  
  /**
   * Get considerations - Simplified, removed long lists
   */
  private getConsiderations(category: string): string[] {
    // Return empty - no long consideration lists needed
    return [];
  }
  
  /**
   * Get user-friendly label
   */
  private getUserFriendlyLabel(name: string): string {
    return name;
  }
  
  /**
   * Get pros for specific node
   */
  private getProsForNode(nodeId: string): string[] {
    const prosMap: Record<string, string[]> = {
      slack: ["Team collaboration", "Rich formatting", "Threads and reactions", "Easy integration"],
      email: ["Universal", "Detailed content", "Attachments", "Professional"],
      discord: ["Free", "Easy setup", "Rich formatting", "Community-friendly"],
      twilio: ["Urgent alerts", "High delivery rate", "Global reach", "Two-way communication"],
      gmail: ["Professional", "Google integration", "Rich formatting", "Familiar interface"],
      postgresql: ["Powerful queries", "ACID compliance", "Mature ecosystem", "Complex relationships"],
      supabase: ["Real-time", "Built-in auth", "Easy setup", "Modern API"],
      mysql: ["Widely used", "Good performance", "Large community", "Proven reliability"],
      s3: ["Scalable", "Cost-effective", "Reliable", "Global CDN"],
      google_drive: ["Collaboration", "Easy sharing", "Google integration", "User-friendly"],
      schedule: ["Precise timing", "Cron support", "Timezone aware", "Reliable"],
      interval: ["Simple", "Flexible", "Easy to understand", "Good for polling"],
      webhook: ["Real-time", "Event-driven", "Efficient", "No polling needed"],
      manual: ["Full control", "Testing friendly", "On-demand", "No scheduling needed"]
    };
    
    return prosMap[nodeId] || [];
  }
  
  /**
   * Get cons for specific node
   */
  private getConsForNode(nodeId: string): string[] {
    const consMap: Record<string, string[]> = {
      slack: ["Requires Slack workspace", "Team-focused", "Limited external access"],
      email: ["Can be filtered as spam", "Less immediate", "Requires SMTP setup"],
      discord: ["Requires Discord server", "Less professional", "Limited business use"],
      twilio: ["Cost per message", "Requires phone numbers", "Character limits"],
      gmail: ["Requires Google account", "OAuth complexity", "Rate limits"],
      postgresql: ["Requires SQL knowledge", "Setup complexity", "Manual scaling"],
      supabase: ["Vendor lock-in", "Limited customization", "Pricing at scale"],
      mysql: ["Less modern features", "Manual scaling", "Configuration complexity"],
      s3: ["AWS dependency", "Learning curve", "Cost at scale"],
      google_drive: ["Google dependency", "OAuth setup", "Storage limits"],
      schedule: ["Less flexible", "Requires cron knowledge", "Timezone complexity"],
      interval: ["Not precise", "Polling overhead", "Resource usage"],
      webhook: ["Requires endpoint", "Security concerns", "Dependency on caller"],
      manual: ["No automation", "Requires user action", "Not scalable"]
    };
    
    return consMap[nodeId] || [];
  }
  
  /**
   * Get best use cases for node
   */
  private getBestUseCases(nodeId: string): string[] {
    const useCasesMap: Record<string, string[]> = {
      slack: ["Team notifications", "Daily standups", "Status updates", "Internal alerts"],
      email: ["Customer notifications", "Reports", "Formal communication", "External users"],
      discord: ["Community updates", "Gaming notifications", "Informal alerts"],
      twilio: ["Urgent alerts", "2FA codes", "Order confirmations", "Emergency notifications"],
      gmail: ["Business emails", "Google Workspace integration", "Professional communication"],
      postgresql: ["Complex queries", "Relational data", "Enterprise applications"],
      supabase: ["Real-time apps", "User management", "Modern web apps", "Quick prototyping"],
      mysql: ["Web applications", "Content management", "E-commerce"],
      s3: ["Large files", "Backups", "Static assets", "Media storage"],
      google_drive: ["Team collaboration", "Document sharing", "Google Workspace"],
      schedule: ["Daily reports", "Regular syncs", "Time-based tasks"],
      interval: ["Polling APIs", "Regular checks", "Simple automation"],
      webhook: ["Real-time events", "API callbacks", "External triggers"],
      manual: ["Testing", "Ad-hoc tasks", "One-time runs"]
    };
    
    return useCasesMap[nodeId] || [];
  }
  
  /**
   * Get complexity rating
   */
  private getComplexityRating(nodeId: string): 'low' | 'medium' | 'high' {
    const complexityMap: Record<string, 'low' | 'medium' | 'high'> = {
      slack: 'low',
      email: 'medium',
      discord: 'low',
      twilio: 'medium',
      gmail: 'medium',
      postgresql: 'high',
      supabase: 'low',
      mysql: 'high',
      s3: 'medium',
      google_drive: 'medium',
      schedule: 'medium',
      interval: 'low',
      webhook: 'low',
      manual: 'low'
    };
    
    return complexityMap[nodeId] || 'medium';
  }
}

// Export singleton instance
export const questionFormatter = new QuestionFormatter();
