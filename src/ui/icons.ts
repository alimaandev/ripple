import figures from "figures";

/**
 * CLI glyph registry. `figures` keeps every symbol cross-platform and gives
 * a sensible fallback on consoles that cannot render Unicode.
 */

export type IconName =
  | "tick"
  | "cross"
  | "warning"
  | "info"
  | "arrowRight"
  | "pointer"
  | "bullet"
  | "ellipsis"
  | "circle";

/** Resolve a named glyph for terminal output. */
export function icon(name: IconName): string {
  return figures[name];
}
