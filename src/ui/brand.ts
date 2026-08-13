import chalk from "chalk";
import type { TextStyle } from "../formatter/text.js";

/**
 * Brand identity primitives: the flat header line shown at the top of every
 * interactive command and the `›`-prefixed section titles between blocks.
 *
 * The layout is deliberately minimal — no boxes or dividers — so reports
 * read like a terminal-first tool rather than a printed page.
 */

export interface BrandOptions {
  /** Command label, e.g. `impact analysis`. */
  label: string;
  /** Semantic version to annotate the header with. */
  version?: string;
  style: TextStyle;
}

/**
 * Render the branded header as a single flat line:
 *
 *   ripple · impact analysis · v0.1.1
 *
 * The brand name is bold cyan; the version is dimmed. Colorless output
 * falls back to the plain em-dash line.
 */
export function brandHeader(options: BrandOptions): string {
  const { label, version, style } = options;
  if (!style.color) {
    return `ripple — ${label}${version ? ` · v${version}` : ""}`;
  }
  const title = chalk.bold.cyan(`ripple · ${label}`);
  return `${title}${version ? ` ${chalk.dim(`· v${version}`)}` : ""}`;
}

/**
 * Section title, optionally prefixed with a dim caret in colored output:
 *
 *   › Top impact
 */
export function sectionHeader(title: string, style: TextStyle): string {
  if (!style.color) return title;
  return `${chalk.dim("›")} ${chalk.bold(title)}`;
}
