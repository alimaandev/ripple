import path from "node:path";
import type { AliasMap } from "../types/config.js";
import type { TsconfigInfo } from "../types/project.js";

/**
 * Alias normalization.
 *
 * User aliases (`ripple.config.ts`) and tsconfig `paths` are merged into one
 * map of pattern → absolute target. Both support a single `*` wildcard:
 *
 *   `{ "@": "./src" }`      → `{ "@/*": "<root>/src/*" }`
 *   tsconfig `"@/*": ["./src/*"]` → `{ "@/*": "<root>/src/*" }`
 *
 * Keys without a wildcard are treated as prefixes, so `"@"` covers
 * `@/components/Button` the way TypeScript users expect.
 */

const WILDCARD = "*";

function hasWildcard(value: string): boolean {
  return value.includes(WILDCARD);
}

/**
 * Normalize a user-config alias entry against `baseDir`.
 * Returns the pattern and its absolute target, or `undefined` for invalid
 * entries (empty key or non-relative target is allowed but must be absolute
 * after resolution).
 */
function normalizeEntry(
  key: string,
  target: string,
  baseDir: string,
): { pattern: string; target: string } {
  const trimmedKey = key.replace(/\/+$/, "");
  const trimmedTarget = target.replace(/\/+$/, "");

  if (hasWildcard(trimmedKey)) {
    return { pattern: trimmedKey, target: path.resolve(baseDir, trimmedTarget) };
  }
  return {
    pattern: `${trimmedKey}/${WILDCARD}`,
    target: path.join(path.resolve(baseDir, trimmedTarget), WILDCARD),
  };
}

/**
 * Merge user aliases and tsconfig paths into a single normalized map.
 * User aliases win on pattern collisions.
 */
export function buildAliasMap(
  configAliases: Record<string, string>,
  tsconfig: TsconfigInfo | undefined,
  rootDir: string,
): AliasMap {
  const merged: AliasMap = {};

  if (tsconfig) {
    const base = tsconfig.baseUrl ?? tsconfig.dir;
    for (const [pattern, targets] of Object.entries(tsconfig.paths)) {
      const first = targets[0];
      if (!first) continue;
      const absolute = path.isAbsolute(first) ? first : path.resolve(base, first);
      merged[pattern] = absolute;
    }
  }

  for (const [key, target] of Object.entries(configAliases)) {
    if (key === "") continue;
    const entry = normalizeEntry(key, target, rootDir);
    merged[entry.pattern] = entry.target;
  }

  return merged;
}

/**
 * Substitute a specifier against an alias map. Returns the absolute-ish
 * candidate path or `undefined` when no pattern matches.
 */
export function substituteAlias(specifier: string, aliases: AliasMap): string | undefined {
  for (const [pattern, target] of Object.entries(aliases)) {
    const starIndex = pattern.indexOf(WILDCARD);
    if (starIndex === -1) {
      if (specifier === pattern) return target;
      continue;
    }
    const prefix = pattern.slice(0, starIndex);
    const suffix = pattern.slice(starIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const captured = specifier.slice(prefix.length, specifier.length - suffix.length);
    const targetStar = target.indexOf(WILDCARD);
    if (targetStar === -1) return target;
    return target.slice(0, targetStar) + captured + target.slice(targetStar + 1);
  }
  return undefined;
}
