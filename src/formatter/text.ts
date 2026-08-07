import chalk from "chalk";
import type { RiskLevel } from "../types/risk.js";

/**
 * Terminal text helpers. All functions take a `color` flag so output stays
 * deterministic in tests and in `--json` mode.
 */

export interface TextStyle {
  color: boolean;
}

/** Muted/secondary text, e.g. hints and counts. */
export function dim(text: string, style: TextStyle): string {
  return style.color ? chalk.dim(text) : text;
}

/** Emphasized value text. */
export function strong(text: string, style: TextStyle): string {
  return style.color ? chalk.bold(text) : text;
}

const RISK_COLORS: Record<RiskLevel, (text: string) => string> = {
  LOW: (text) => chalk.green(text),
  MEDIUM: (text) => chalk.yellow(text),
  HIGH: (text) => chalk.magenta(text),
  CRITICAL: (text) => chalk.red.bold(text),
};

/** Chalk style function for a risk level. */
export function riskColor(level: RiskLevel): (text: string) => string {
  return RISK_COLORS[level];
}

/** Colored risk level badge, e.g. ` HIGH `. */
export function riskBadge(level: RiskLevel, style: TextStyle): string {
  return style.color ? RISK_COLORS[level](level) : level;
}

/** Confidence percentage with a subtle color cue. */
export function confidenceText(percent: number, style: TextStyle): string {
  const text = `${percent}%`;
  if (!style.color) return text;
  if (percent >= 90) return chalk.green(text);
  if (percent >= 70) return chalk.yellow(text);
  return chalk.red(text);
}

/** Humanize a duration in milliseconds. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format a number with a plural-friendly noun, e.g. `7 files`. */
export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}
