import fg from "fast-glob";

/**
 * File discovery on top of fast-glob.
 *
 * Patterns are resolved against `cwd`; results are absolute native paths.
 * A file may match several `include` patterns; results are deduplicated.
 */

export interface GlobOptions {
  cwd: string;
  /** Glob patterns to include. */
  patterns: string[];
  /** Glob patterns to ignore. */
  ignore: string[];
}

export async function globFiles(options: GlobOptions): Promise<string[]> {
  const matches = await fg(options.patterns, {
    cwd: options.cwd,
    ignore: options.ignore,
    onlyFiles: true,
    absolute: true,
    unique: true,
    followSymbolicLinks: false,
    suppressErrors: true,
  });
  return matches;
}

/** Convert a plain directory/segment name to an ignore glob that matches it at any depth. */
export function toIgnoreGlob(segment: string): string {
  const trimmed = segment.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return "";
  const glob = trimmed.includes("*") || trimmed.includes("{") ? trimmed : `**/${trimmed}/**`;
  return glob;
}
