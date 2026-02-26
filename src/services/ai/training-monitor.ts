// Training System Monitor
// Tracks training effectiveness and usage metrics

interface TrainingUsage {
  timestamp: string;
  type: 'systemPrompt' | 'requirements' | 'nodeSelection' | 'execution';
  prompt: string;
  examplesUsed: number;
  success: boolean;
}

interface TrainingMetrics {
  totalUsage: number;
  usageByType: Record<string, number>;
  successRate: number;
  averageExamplesUsed: number;
  recentUsage: TrainingUsage[];
}

export class TrainingMonitor {
  private usageHistory: TrainingUsage[] = [];
  private maxHistorySize = 1000;

  /**
   * Record training usage
   */
  recordUsage(
    type: 'systemPrompt' | 'requirements' | 'nodeSelection' | 'execution',
    prompt: string,
    examplesUsed: number,
    success: boolean = true
  ): void {
    const usage: TrainingUsage = {
      timestamp: new Date().toISOString(),
      type,
      prompt: prompt.substring(0, 200), // Truncate for storage
      examplesUsed,
      success,
    };

    this.usageHistory.push(usage);

    // Keep history size manageable
    if (this.usageHistory.length > this.maxHistorySize) {
      this.usageHistory = this.usageHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get training metrics
   */
  getMetrics(): TrainingMetrics {
    const totalUsage = this.usageHistory.length;
    const usageByType: Record<string, number> = {};
    let successCount = 0;
    let totalExamples = 0;

    this.usageHistory.forEach(usage => {
      usageByType[usage.type] = (usageByType[usage.type] || 0) + 1;
      if (usage.success) {
        successCount++;
      }
      totalExamples += usage.examplesUsed;
    });

    return {
      totalUsage,
      usageByType,
      successRate: totalUsage > 0 ? successCount / totalUsage : 0,
      averageExamplesUsed: totalUsage > 0 ? totalExamples / totalUsage : 0,
      recentUsage: this.usageHistory.slice(-10), // Last 10 usages
    };
  }

  /**
   * Get usage statistics for a specific type
   */
  getTypeStats(type: 'systemPrompt' | 'requirements' | 'nodeSelection' | 'execution'): {
    count: number;
    successRate: number;
    averageExamples: number;
  } {
    const typeUsage = this.usageHistory.filter(u => u.type === type);
    const successCount = typeUsage.filter(u => u.success).length;
    const totalExamples = typeUsage.reduce((sum, u) => sum + u.examplesUsed, 0);

    return {
      count: typeUsage.length,
      successRate: typeUsage.length > 0 ? successCount / typeUsage.length : 0,
      averageExamples: typeUsage.length > 0 ? totalExamples / typeUsage.length : 0,
    };
  }

  /**
   * Clear usage history
   */
  clearHistory(): void {
    this.usageHistory = [];
  }

  /**
   * Get recent usage (last N entries)
   */
  getRecentUsage(limit: number = 10): TrainingUsage[] {
    return this.usageHistory.slice(-limit);
  }

  /**
   * Export usage data for analysis
   */
  exportData(): TrainingUsage[] {
    return [...this.usageHistory];
  }
}

// Export singleton instance
export const trainingMonitor = new TrainingMonitor();

