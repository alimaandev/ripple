import boxen from "boxen";
import chalk from "chalk";
import type { TextStyle } from "../formatter/text.js";
import { icon } from "./icons.js";

/**
 * Brand identity primitives: the header card shown at the top of every
 * interactive command and thin hairline dividers between sections.
 */

export interface BrandOptions {
  /** Command label, e.g. `impact analysis`. */
  label: string;
  /** Semantic version to annotate the header with. */
  version?: string;
  style: TextStyle;
}

/** Width of the hairline divider (roughly half a terminal). */
const DIVIDER_WIDTH = 38;

/**
 * Render the branded header. Colored terminals get a boxed banner:
 *
 *   ╭─ ripple ───────────────────────────────╮
 *   │  ❯ impact analysis · v0.1.1             │
 *   ╰────────────────────────────────────────╯
 *
 * Colorless output falls back to a single plain line.
 */
export function brandHeader(options: BrandOptions): string {
  const { label, version, style } = options;
  if (!style.color) {
    return `ripple — ${label}${version ? ` · v${version}` : ""}`;
  }
  const tagline = `${icon("pointer")} ${label}${version ? ` · v${version}` : ""}`;
  return boxen(` ${tagline}`, {
    padding: { left: 1, right: 1 },
    title: "ripple",
    borderStyle: "round",
    borderColor: "cyan",
  });
}

/**
 * Section header with a hairline separator above it in colored output:
 *
 *   ──────────────────────────────────────────
 *   Top impact
 */
export function sectionHeader(title: string, style: TextStyle): string {
  if (!style.color) return title;
  return `${chalk.dim("─".repeat(DIVIDER_WIDTH))}\n${chalk.bold(title)}`;
}
