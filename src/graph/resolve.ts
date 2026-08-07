import fs from "node:fs";
import path from "node:path";
import { substituteAlias } from "../config/aliases.js";
import type { AliasMap } from "../types/config.js";
import type { EdgeKind } from "../types/graph.js";
import { extensionCandidates, jsToTsCandidate, pathKey } from "../utils/paths.js";

/**
 * Module specifier resolution.
 *
 * Resolution pipeline for one import declaration:
 *
 * 1. Alias substitution (`ripple.config.ts` aliases + tsconfig `paths`).
 * 2. Relative/bare classification.
 * 3. Candidate probing: exact, extension candidates, directory index files.
 *    `.js` specifiers may resolve to `.ts` files (NodeNext-style projects).
 * 4. Bare specifiers that cannot be probed are external.
 * 5. Relative imports that point at existing files outside the analyzed set
 *    (assets like `.css`, `.json`, or ignored source files) are external —
 *    they exist, Ripple just does not model them.
 *
 * The resolver is a pure function of its inputs and does no I/O beyond
 * cheap existence checks.
 */

export interface ResolverContext {
  /** Project root. */
  rootDir: string;
  aliases: AliasMap;
  /** Canonical keys of all discovered files. */
  fileKeys: Set<string>;
}

export interface ResolvedEdge {
  /** Absolute path of the resolved file, for internal edges. */
  filePath?: string;
  kind: EdgeKind;
}

/** Replace the last extension-less segment and probe existing files. */
function probeCandidates(base: string, fileKeys: Set<string>, rootDir: string): string | undefined {
  for (const candidate of extensionCandidates(base)) {
    const key = pathKey(candidate, rootDir);
    if (fileKeys.has(key)) return path.normalize(candidate);
  }
  const jsSwapped = jsToTsCandidate(base);
  if (jsSwapped !== base) {
    const swappedKey = pathKey(jsSwapped, rootDir);
    if (fileKeys.has(swappedKey)) return path.normalize(jsSwapped);
  }
  return undefined;
}

/** An absolute path exists on disk as a file or directory. */
function existsOnDisk(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a specifier to an absolute candidate path (possibly
 * extension-less) or `undefined` when the specifier cannot be interpreted.
 */
function specifierToBase(
  specifier: string,
  fromDir: string,
  context: ResolverContext,
): string | undefined {
  const { rootDir, aliases } = context;

  if (specifier.startsWith("/")) {
    return path.resolve(rootDir, specifier.slice(1));
  }
  if (specifier.startsWith(".")) {
    return path.resolve(fromDir, specifier);
  }
  const substituted = substituteAlias(specifier, aliases);
  if (substituted === undefined) return undefined;
  return path.isAbsolute(substituted) ? substituted : path.resolve(rootDir, substituted);
}

/** Resolve a specifier to a discovered file, or `undefined`. */
function resolveToFile(base: string, context: ResolverContext): string | undefined {
  const { rootDir, fileKeys } = context;

  const exactKey = pathKey(base, rootDir);
  if (fileKeys.has(exactKey)) return path.normalize(base);

  const probed = probeCandidates(base, fileKeys, rootDir);
  if (probed) return probed;

  if (existsOnDisk(base) && fs.statSync(base).isDirectory()) {
    const indexProbed = probeCandidates(path.join(base, "index"), fileKeys, rootDir);
    if (indexProbed) return indexProbed;
  }

  return undefined;
}

/**
 * Resolve one import declaration from a source file. Returns the edge kind
 * and, for internal edges, the absolute target path.
 */
export function resolveEdge(
  specifier: string,
  fromPath: string,
  context: ResolverContext,
): ResolvedEdge {
  const base = specifierToBase(specifier, path.dirname(fromPath), context);

  if (base !== undefined) {
    const resolved = resolveToFile(base, context);
    if (resolved !== undefined) return { filePath: resolved, kind: "internal" };
    if (existsOnDisk(base)) return { kind: "external" };
  }

  const isRelative = specifier.startsWith(".") || specifier.startsWith("/");
  const isAlias = specifierToBase(specifier, path.dirname(fromPath), context) !== undefined;
  if (isRelative || isAlias) return { kind: "unresolved" };
  return { kind: "external" };
}

/**
 * Resolve every import of a file against the discovered file set.
 * Returns internal target paths, external specifiers and unresolved
 * specifiers, in declaration order.
 */
export function resolveImports(
  fromPath: string,
  importSpecifiers: string[],
  context: ResolverContext,
): { internal: string[]; external: string[]; unresolved: string[] } {
  const internal: string[] = [];
  const external: string[] = [];
  const unresolved: string[] = [];

  for (const specifier of importSpecifiers) {
    const edge = resolveEdge(specifier, fromPath, context);
    if (edge.kind === "internal" && edge.filePath) {
      internal.push(edge.filePath);
    } else if (edge.kind === "external") {
      external.push(specifier);
    } else {
      unresolved.push(specifier);
    }
  }

  return { internal, external, unresolved };
}
