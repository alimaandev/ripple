/**
 * Risk engine types: a deterministic weighted heuristic that maps graph
 * signals to a 0-100 score and a level.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const RISK_LEVELS: readonly RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** One contributing factor of the score, for transparency in `--verbose`. */
export interface RiskFactor {
  /** Stable machine-readable factor name. */
  name: string;
  /** Human-readable label. */
  label: string;
  /** Configured weight (0-1). */
  weight: number;
  /** Normalized signal value (0-1). */
  value: number;
  /** `weight * value * 100`, the points this factor contributes. */
  contribution: number;
}

export interface RiskResult {
  /** Final score, 0-100. */
  score: number;
  level: RiskLevel;
  /** Every factor and its contribution. */
  factors: RiskFactor[];
}
