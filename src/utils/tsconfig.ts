import path from "node:path";
import { ts } from "ts-morph";
import type { TsconfigInfo } from "../types/project.js";
import { pathExistsSync } from "./fs.js";

/**
 * tsconfig.json loading and alias extraction.
 *
 * Uses the TypeScript compiler API (bundled with ts-morph) so that `extends`,
 * comments and JSONC are handled exactly like the real compiler handles them.
 */
export function findTsconfig(startDir: string): string | undefined {
  return ts.findConfigFile(startDir, pathExistsSync, "tsconfig.json");
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Read and parse a tsconfig.json. Returns `undefined` when the file is
 * missing or malformed (callers decide how to surface that).
 */
export function readTsconfig(tsconfigPath: string): TsconfigInfo | undefined {
  if (!pathExistsSync(tsconfigPath)) return undefined;
  const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (readResult.error) return undefined;

  const dir = path.dirname(tsconfigPath);
  const parsed = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    dir,
    undefined,
    tsconfigPath,
  );
  if (parsed.errors.length > 0) return undefined;

  const options = parsed.options;
  const paths: Record<string, string[]> = {};
  if (options.paths) {
    for (const [pattern, targets] of Object.entries(options.paths)) {
      paths[pattern] = [...targets];
    }
  }

  return {
    path: tsconfigPath,
    dir,
    baseUrl: options.baseUrl ? path.resolve(dir, options.baseUrl) : undefined,
    paths,
    include: asStringArray(readResult.config.include ?? []),
    exclude: asStringArray(readResult.config.exclude ?? []),
  };
}

/**
 * Match a module specifier against `paths` patterns.
 *
 * Supports a single `*` wildcard in both pattern and replacement
 * (`"@/*": ["./src/*"]`). Returns the substituted absolute-ish path and the
 * captured wildcard value, or `undefined` when nothing matches.
 */
export function matchAlias(
  specifier: string,
  paths: Record<string, string[]>,
): { target: string; matchedPattern: string } | undefined {
  for (const [pattern, replacements] of Object.entries(paths)) {
    const starIndex = pattern.indexOf("*");
    if (starIndex === -1) {
      if (specifier === pattern) {
        const replacement = replacements[0];
        if (replacement) return { target: replacement, matchedPattern: pattern };
      }
      continue;
    }
    const prefix = pattern.slice(0, starIndex);
    const suffix = pattern.slice(starIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const captured = specifier.slice(prefix.length, specifier.length - suffix.length);

    for (const replacement of replacements) {
      const replacementStar = replacement.indexOf("*");
      const target =
        replacementStar === -1
          ? replacement
          : replacement.slice(0, replacementStar) +
            captured +
            replacement.slice(replacementStar + 1);
      return { target, matchedPattern: pattern };
    }
  }
  return undefined;
}
