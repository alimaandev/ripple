import fs from "node:fs";
import path from "node:path";
import type { SourceFileKind } from "../types/parser.js";

/**
 * Path helpers shared across Ripple.
 *
 * Canonical path keys are POSIX-style normalized absolute paths. On Windows
 * they are lower-cased because the filesystem is case-insensitive; two paths
 * differing only in case must not create two graph nodes.
 */

export const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
] as const;

export const RESOLVABLE_EXTENSIONS = [...SOURCE_EXTENSIONS, ".d.ts"] as const;

/** Convert a path to forward slashes for display and matching. */
export function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/** Normalize a path and make it absolute. */
export function normalizeAbsolute(filePath: string, cwd: string): string {
  return path.resolve(cwd, filePath);
}

/**
 * Canonical absolute path: resolves symlinks and Windows 8.3 short names so
 * two strings that name the same file compare equal. Falls back to
 * `path.resolve` when the path does not exist.
 *
 * Git returns canonical (long) paths while Node can inherit a short-name cwd
 * from the environment; without this, `path.relative` between the two invents
 * a `..`-laden path and the changed file looks like it is outside the project.
 */
export function realPath(filePath: string, cwd: string): string {
  const absolute = path.resolve(cwd, filePath);
  try {
    return fs.realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

/**
 * Canonical key for use in Maps/Sets: normalized, POSIX, and lower-cased on
 * Windows.
 */
export function pathKey(filePath: string, cwd: string): string {
  const absolute = normalizeAbsolute(filePath, cwd);
  const posix = toPosix(absolute);
  return process.platform === "win32" ? posix.toLowerCase() : posix;
}

/** Whether a module specifier is a relative import (`./` or `../`). */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/** Whether the specifier is a bare package import (`react`, `@scope/pkg`). */
export function isBareSpecifier(specifier: string): boolean {
  return !isRelativeSpecifier(specifier) && !specifier.startsWith("/");
}

/** Source file kind from an absolute path. Declaration files are excluded. */
export function sourceFileKind(filePath: string): SourceFileKind | undefined {
  if (/\.d\.[cm]?ts$/i.test(filePath)) return undefined;
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.includes(ext as (typeof SOURCE_EXTENSIONS)[number])
    ? (ext.slice(1) as SourceFileKind)
    : undefined;
}

/** The extension-candidates list for resolving an extensionless import. */
export function extensionCandidates(basePath: string): string[] {
  return RESOLVABLE_EXTENSIONS.map((ext) => basePath + ext);
}

/**
 * TS-style JS extension swaps: when a specifier imports `./x.js` but only
 * `./x.ts` (or `./x.tsx`) exists, the candidate resolves to the TS file.
 * Returns every plausible TS sibling; the resolver probes them in order.
 */
export function jsToTsCandidates(candidate: string): string[] {
  const ext = path.extname(candidate).toLowerCase();
  if (ext === "") return [];
  const stem = candidate.slice(0, -ext.length);
  switch (ext) {
    case ".js":
      return [`${stem}.ts`, `${stem}.tsx`];
    case ".jsx":
      return [`${stem}.tsx`];
    case ".mjs":
      return [`${stem}.mts`];
    case ".cjs":
      return [`${stem}.cts`];
    default:
      return [];
  }
}

/** First JS-to-TS candidate, or the input unchanged when there is none. */
export function jsToTsCandidate(candidate: string): string {
  return jsToTsCandidates(candidate)[0] ?? candidate;
}

/** Human-readable relative path (from cwd) for display in output. */
export function displayPath(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath);
  return toPosix(relative === "" ? path.basename(filePath) : relative);
}

/**
 * First path segment of `filePath` relative to `root`, used for impact areas.
 * Returns `undefined` when the file is outside the root.
 */
export function firstSegment(filePath: string, root: string): string | undefined {
  const relative = toPosix(path.relative(root, filePath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  const segment = relative.split("/")[0];
  return segment && segment !== "" ? segment : undefined;
}
