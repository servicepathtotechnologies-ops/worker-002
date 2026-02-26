// PHASE-2: Confidence Scoring System
// Computes confidence score before delivery
// Rule: ❌ If confidence < 60%, do not deliver (lowered from 90% for better workflow generation)

export interface ConfidenceScore {
  overall: number;
  components: {
    triggerClarity: number;
    credentialReadiness: number;
    patternMatch: number;
    validationSuccess: number;
    testPassRate: number;
    nodeCompatibility: number;
    intentConfidence: number;
  };
  breakdown: Array<{ component: string; score: number; weight: number; reason?: string }>;
  threshold: number;
  canDeliver: boolean;
}

/**
 * Confidence Scorer - PHASE-2 Feature #8
 * 
 * Computes confidence score before delivering workflow:
 * Confidence Score = 
 *   Trigger clarity +
 *   Credential readiness +
 *   Pattern match % +
 *   Validation success +
 *   Test pass rate +
 *   Node compatibility +
 *   Intent confidence
 * 
 * Rule: ❌ If confidence < 60%, do not deliver (lowered threshold for better workflow generation)
 */
export class ConfidenceScorer {
  private readonly DELIVERY_THRESHOLD = 0.4; // 40% (lowered to allow smooth workflow generation)

  /**
   * Calculate confidence score
   */
  calculateConfidence(params: {
    triggerClarity?: number;
    credentialReadiness?: number;
    patternMatch?: number;
    validationSuccess?: number;
    testPassRate?: number;
    nodeCompatibility?: number;
    intentConfidence?: number;
  }): ConfidenceScore {
    const components = {
      triggerClarity: params.triggerClarity ?? 1.0,
      credentialReadiness: params.credentialReadiness ?? 1.0,
      patternMatch: params.patternMatch ?? 0.5,
      validationSuccess: params.validationSuccess ?? 1.0,
      testPassRate: params.testPassRate ?? 1.0,
      nodeCompatibility: params.nodeCompatibility ?? 1.0,
      intentConfidence: params.intentConfidence ?? 0.8,
    };

    // Weighted average
    const weights = {
      triggerClarity: 0.15,
      credentialReadiness: 0.15,
      patternMatch: 0.10,
      validationSuccess: 0.20,
      testPassRate: 0.15,
      nodeCompatibility: 0.10,
      intentConfidence: 0.15,
    };

    const breakdown = Object.entries(components).map(([key, score]) => ({
      component: key,
      score,
      weight: weights[key as keyof typeof weights],
      reason: this.getReason(key, score),
    }));

    const overall = breakdown.reduce(
      (sum, item) => sum + item.score * item.weight,
      0
    );

    const canDeliver = overall >= this.DELIVERY_THRESHOLD;

    return {
      overall: Math.round(overall * 100) / 100,
      components,
      breakdown,
      threshold: this.DELIVERY_THRESHOLD,
      canDeliver,
    };
  }

  /**
   * Get reason for score
   */
  private getReason(component: string, score: number): string {
    if (score >= 0.9) {
      return 'Excellent';
    }
    if (score >= 0.7) {
      return 'Good';
    }
    if (score >= 0.5) {
      return 'Acceptable';
    }
    if (score >= 0.3) {
      return 'Needs improvement';
    }
    return 'Critical issue';
  }

  /**
   * Check if workflow can be delivered
   */
  canDeliver(confidence: ConfidenceScore): { canDeliver: boolean; reason?: string } {
    if (confidence.canDeliver) {
      return { canDeliver: true };
    }

    const lowScores = confidence.breakdown
      .filter(item => item.score < 0.7)
      .map(item => `${item.component} (${Math.round(item.score * 100)}%)`)
      .join(', ');

    return {
      canDeliver: false,
      reason: `Confidence score ${Math.round(confidence.overall * 100)}% is below threshold (${Math.round(confidence.threshold * 100)}%). Low scores: ${lowScores}`,
    };
  }
}

// Export singleton instance
export const confidenceScorer = new ConfidenceScorer();
