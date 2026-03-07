/**
 * ✅ COMPREHENSIVE NODE REPLACEMENT TRACKER
 * 
 * Tracks ALL node replacements/removals with detailed reasons and statistics
 * Used for debugging and understanding why nodes are being replaced
 */

export interface NodeReplacement {
  nodeId?: string;
  nodeType: string;
  operation?: string;
  category: 'dataSource' | 'transformation' | 'output';
  reason: string;
  stage: string; // Where replacement happened
  replacedBy?: string; // Node type that replaced it
  confidence?: number; // Intent confidence when replacement happened
  isProtected?: boolean; // Was node protected (user-explicit)?
  wasRemoved: boolean; // true if removed, false if replaced
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ReplacementStatistics {
  totalReplacements: number;
  totalRemovals: number;
  replacementsByStage: Map<string, number>;
  replacementsByReason: Map<string, number>;
  replacementsByCategory: Map<string, number>;
  protectedNodesRemoved: number; // Should be 0!
  highConfidenceReplacements: number; // Replacements when confidence > 0.8
  allReplacements: NodeReplacement[];
}

export class NodeReplacementTracker {
  private replacements: NodeReplacement[] = [];
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.8;

  /**
   * Track a node replacement/removal
   */
  trackReplacement(replacement: Omit<NodeReplacement, 'timestamp'>): void {
    const fullReplacement: NodeReplacement = {
      ...replacement,
      timestamp: Date.now(),
    };

    this.replacements.push(fullReplacement);

    // Log detailed replacement info
    const logLevel = replacement.isProtected ? 'ERROR' : 'WARN';
    const protectionStatus = replacement.isProtected ? '⚠️ PROTECTED NODE' : '';
    const confidenceInfo = replacement.confidence 
      ? `(confidence: ${(replacement.confidence * 100).toFixed(1)}%)` 
      : '';
    
    console.log(
      `[NodeReplacementTracker] ${logLevel} ${protectionStatus} ` +
      `Stage: ${replacement.stage} | ` +
      `Type: ${replacement.nodeType} | ` +
      `Category: ${replacement.category} | ` +
      `Reason: ${replacement.reason} | ` +
      `${replacement.replacedBy ? `Replaced by: ${replacement.replacedBy} | ` : ''}` +
      `${confidenceInfo}`
    );

    // Alert if protected node is being removed
    if (replacement.isProtected && replacement.wasRemoved) {
      console.error(
        `[NodeReplacementTracker] 🚨 CRITICAL: Protected node removed! ` +
        `This should NEVER happen. Node: ${replacement.nodeType}, ` +
        `Stage: ${replacement.stage}, Reason: ${replacement.reason}`
      );
    }

    // Alert if high confidence node is being replaced
    if (replacement.confidence && replacement.confidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
      console.warn(
        `[NodeReplacementTracker] ⚠️  High confidence node replaced! ` +
        `Confidence: ${(replacement.confidence * 100).toFixed(1)}%, ` +
        `Node: ${replacement.nodeType}, ` +
        `Stage: ${replacement.stage}, ` +
        `Reason: ${replacement.reason}`
      );
    }
  }

  /**
   * Get comprehensive statistics
   */
  getStatistics(): ReplacementStatistics {
    const stats: ReplacementStatistics = {
      totalReplacements: this.replacements.length,
      totalRemovals: this.replacements.filter(r => r.wasRemoved).length,
      replacementsByStage: new Map(),
      replacementsByReason: new Map(),
      replacementsByCategory: new Map(),
      protectedNodesRemoved: this.replacements.filter(r => r.isProtected && r.wasRemoved).length,
      highConfidenceReplacements: this.replacements.filter(
        r => r.confidence && r.confidence >= this.HIGH_CONFIDENCE_THRESHOLD
      ).length,
      allReplacements: [...this.replacements],
    };

    // Count by stage
    for (const replacement of this.replacements) {
      const stageCount = stats.replacementsByStage.get(replacement.stage) || 0;
      stats.replacementsByStage.set(replacement.stage, stageCount + 1);

      const reasonCount = stats.replacementsByReason.get(replacement.reason) || 0;
      stats.replacementsByReason.set(replacement.reason, reasonCount + 1);

      const categoryCount = stats.replacementsByCategory.get(replacement.category) || 0;
      stats.replacementsByCategory.set(replacement.category, categoryCount + 1);
    }

    return stats;
  }

  /**
   * Generate detailed analysis report
   */
  generateAnalysisReport(): string {
    const stats = this.getStatistics();
    
    let report = '\n';
    report += '═══════════════════════════════════════════════════════════════\n';
    report += '📊 NODE REPLACEMENT ANALYSIS REPORT\n';
    report += '═══════════════════════════════════════════════════════════════\n\n';

    // Summary
    report += '📈 SUMMARY:\n';
    report += `  Total Replacements: ${stats.totalReplacements}\n`;
    report += `  Total Removals: ${stats.totalRemovals}\n`;
    report += `  Protected Nodes Removed: ${stats.protectedNodesRemoved} ${stats.protectedNodesRemoved > 0 ? '🚨 ERROR!' : '✅ OK'}\n`;
    report += `  High Confidence Replacements: ${stats.highConfidenceReplacements} ${stats.highConfidenceReplacements > 0 ? '⚠️  WARNING' : '✅ OK'}\n\n`;

    // By Stage
    report += '📍 REPLACEMENTS BY STAGE:\n';
    const sortedStages = Array.from(stats.replacementsByStage.entries())
      .sort((a, b) => b[1] - a[1]);
    for (const [stage, count] of sortedStages) {
      report += `  ${stage}: ${count} replacement(s)\n`;
    }
    report += '\n';

    // By Reason
    report += '🔍 REPLACEMENTS BY REASON:\n';
    const sortedReasons = Array.from(stats.replacementsByReason.entries())
      .sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sortedReasons) {
      report += `  "${reason}": ${count} time(s)\n`;
    }
    report += '\n';

    // By Category
    report += '📦 REPLACEMENTS BY CATEGORY:\n';
    for (const [category, count] of stats.replacementsByCategory.entries()) {
      report += `  ${category}: ${count} replacement(s)\n`;
    }
    report += '\n';

    // Detailed List
    if (stats.allReplacements.length > 0) {
      report += '📋 DETAILED REPLACEMENT LIST:\n';
      for (let i = 0; i < stats.allReplacements.length; i++) {
        const r = stats.allReplacements[i];
        report += `\n  ${i + 1}. ${r.nodeType} (${r.category})\n`;
        report += `     Stage: ${r.stage}\n`;
        report += `     Reason: ${r.reason}\n`;
        if (r.replacedBy) {
          report += `     Replaced by: ${r.replacedBy}\n`;
        }
        if (r.confidence) {
          report += `     Confidence: ${(r.confidence * 100).toFixed(1)}%\n`;
        }
        if (r.isProtected) {
          report += `     ⚠️  PROTECTED NODE\n`;
        }
        report += `     Timestamp: ${new Date(r.timestamp).toISOString()}\n`;
      }
    }

    report += '\n═══════════════════════════════════════════════════════════════\n';

    return report;
  }

  /**
   * Clear all tracked replacements
   */
  clear(): void {
    this.replacements = [];
  }

  /**
   * Get all replacements
   */
  getAllReplacements(): NodeReplacement[] {
    return [...this.replacements];
  }
}

// Singleton instance
export const nodeReplacementTracker = new NodeReplacementTracker();
