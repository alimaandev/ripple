import type { RiskThresholds } from "../types/config.js";
import type { RiskLevel } from "../types/risk.js";

/**
 * Map a 0-100 risk score to a level using the configured thresholds.
 */
export function scoreToLevel(score: number, thresholds: RiskThresholds): RiskLevel {
  if (score >= thresholds.critical) return "CRITICAL";
  if (score >= thresholds.high) return "HIGH";
  if (score >= thresholds.medium) return "MEDIUM";
  return "LOW";
}

/** Clamp a value into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Log-scale a count into [0, 1]: 0 stays 0, `cap` reaches 1, everything
 * above `cap` saturates. Prevents one huge graph from dominating the score.
 */
export function logScale(count: number, cap: number): number {
  if (count <= 0) return 0;
  return clamp(Math.log10(count + 1) / Math.log10(cap + 1), 0, 1);
}
