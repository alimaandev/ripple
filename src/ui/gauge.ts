import type { TextStyle } from "../formatter/text.js";
import { riskColor } from "../formatter/text.js";
import type { RiskLevel } from "../types/risk.js";

/**
 * Risk gauge rendering. A 10-cell bar filled proportionally to the 0-100
 * score and tinted with the risk level color, e.g.:
 *
 *   MEDIUM · 34.4/100 ███░░░░░░░
 *
 * The bar is color-only; colorless output omits it entirely so logs and
 * pipes stay clean and deterministic.
 */

const CELLS = 10;
const FILL = "█";
const EMPTY = "░";

export function riskGauge(score: number, level: RiskLevel, style: TextStyle): string {
  if (!style.color) return "";
  const filled = Math.max(0, Math.min(CELLS, Math.round((score / 100) * CELLS)));
  return riskColor(level)(FILL.repeat(filled) + EMPTY.repeat(CELLS - filled));
}

/** Cells filled for a score, exported for tests. */
export function filledCells(score: number): number {
  return Math.max(0, Math.min(CELLS, Math.round((score / 100) * CELLS)));
}
