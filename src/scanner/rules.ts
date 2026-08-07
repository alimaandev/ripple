import { sourceFileKind, SOURCE_EXTENSIONS } from "../utils/paths.js";

/**
 * Canonical discovery rules: which extensions count as source files and which
 * directories are ignored by default. `src/config/defaults.ts` imports the
 * default ignore names from here so the knowledge lives in exactly one place.
 */

export const SOURCE_EXTENSION_GLOB = `*.{${SOURCE_EXTENSIONS.map((e) => e.slice(1)).join(",")}}`;

/** Extensions accepted by the scanner. */
export const STANDARD_IGNORE_NAMES = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  "out",
  ".git",
] as const;

/** Whether a file path ends with a discoverable source extension. */
export function isSourceFile(filePath: string): boolean {
  return sourceFileKind(filePath) !== undefined;
}
