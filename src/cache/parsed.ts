import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "ts-morph";
import type { RippleConfig } from "../types/config.js";
import type { ParsedFile } from "../types/parser.js";
import { parseMany } from "../parser/parse.js";
import { toPosix } from "../utils/paths.js";

/**
 * Incremental parse cache.
 *
 * Parsing a file with ts-morph (imports, exports, symbols) is the dominant
 * cost of an analysis run. For every discovered file we reuse the previously
 * parsed surface when the file is provably unchanged. Freshness is checked
 * with a cheap mtime+size match first â€” the steady-state hot path touches
 * neither the file contents nor the hasher â€” and the cache is only rewritten
 * to disk when something actually changed, so repeated runs are near-free.
 *
 * The cache is keyed by the discovery-affecting config (include/ignore), so
 * changing discovery invalidates it wholesale. The parsed surface is only a
 * function of file content â€” resolution, cycles and risk are recomputed
 * fresh on every run, so cached runs are byte-identical to cold runs.
 *
 * The cache lives in `<rootDir>/.ripple/cache/` and is written atomically.
 */

export const CACHE_SCHEMA = 2;
export const CACHE_FILE = path.join(".ripple", "cache", "parsed-v2.json");

/**
 * Set `RIPPLE_NO_CACHE=1` to force a cold run (e.g. for benchmarks). The
 * on-disk cache is left untouched.
 */
export const cacheEnabled = (): boolean => process.env.RIPPLE_NO_CACHE !== "1";

/** One cached file: freshness metadata plus the parsed surface. */
export interface ParsedCacheEntry {
  /** Content hash; the source of truth when mtime+size don't match. */
  hash: string;
  /** File size in bytes at cache time (fast freshness check). */
  size: number;
  /** File mtime in ms at cache time (fast freshness check). */
  mtimeMs: number;
  parsed: ParsedFile;
}

interface ParsedCacheManifest {
  schema: number;
  configHash: string;
  files: Record<string, ParsedCacheEntry>;
}

/** sha256 hex of a file's bytes. */
export async function contentHash(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Hash of the discovery-affecting config (include/ignore, sorted for
 * stability). Aliases and tsconfig paths do not affect parsing, so they are
 * deliberately excluded: resolution re-runs against cached surfaces.
 */
export function configCacheHash(config: RippleConfig): string {
  const stable = {
    include: [...config.include].sort(),
    ignore: [...config.ignore].sort(),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

/** Relative POSIX path of a file under the project root. */
function relPosix(rootDir: string, absPath: string): string {
  return toPosix(path.relative(rootDir, absPath));
}

function cachePath(rootDir: string): string {
  return path.join(rootDir, CACHE_FILE);
}

/** Load the cache manifest; any problem (missing, corrupt, stale) â†’ empty. */
export async function loadParsedCache(
  rootDir: string,
  configHash: string,
): Promise<Map<string, ParsedCacheEntry>> {
  let raw: string;
  try {
    raw = await fs.readFile(cachePath(rootDir), "utf8");
  } catch {
    return new Map();
  }
  try {
    const manifest = JSON.parse(raw) as Partial<ParsedCacheManifest>;
    if (manifest.schema !== CACHE_SCHEMA || manifest.configHash !== configHash) {
      return new Map();
    }
    return new Map(Object.entries(manifest.files ?? {}));
  } catch {
    return new Map();
  }
}

/** Persist the cache atomically (tmp file + rename). Never throws. */
export async function saveParsedCache(
  rootDir: string,
  configHash: string,
  entries: Map<string, ParsedCacheEntry>,
): Promise<void> {
  const manifest: ParsedCacheManifest = {
    schema: CACHE_SCHEMA,
    configHash,
    files: Object.fromEntries(entries),
  };
  const target = cachePath(rootDir);
  const tmp = target + ".tmp";
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(manifest), "utf8");
    await fs.rename(tmp, target);
  } catch {
    try {
      await fs.rm(tmp, { force: true });
    } catch {
      /* best effort cleanup */
    }
  }
}

export interface ParsedCacheStats {
  /** Files served from the cache without re-parsing. */
  hits: number;
  /** Files that had to be re-parsed. */
  misses: number;
}

/**
 * Load parsed surfaces for every discovered file, parsing only the files
 * whose content changed since the last run. The result is ordered exactly
 * like `filePaths`, so downstream output is identical to a cold run.
 *
 * When nothing changed, the on-disk cache is not rewritten at all â€” the
 * steady-state hot path is stat + JSON parse + graph rebuild.
 */
export async function loadParsedFiles(options: {
  project: Project;
  rootDir: string;
  filePaths: string[];
  config: RippleConfig;
}): Promise<{ parsedFiles: ParsedFile[]; stats: ParsedCacheStats }> {
  const { project, rootDir, filePaths, config } = options;
  if (!cacheEnabled()) {
    return {
      parsedFiles: parseMany(project, filePaths),
      stats: { hits: 0, misses: filePaths.length },
    };
  }
  const configHash = configCacheHash(config);
  const cached = await loadParsedCache(rootDir, configHash);
  const trace = process.env.RIPPLE_TRACE === "1";
  const traceAt = (label: string, from: number): number => {
    if (trace) console.error(`[trace] cache.${label}: ${Date.now() - from}ms`);
    return Date.now();
  };
  let stage = Date.now();

  const states = await Promise.all(
    filePaths.map(async (abs) => {
      try {
        const stat = await fs.stat(abs);
        return { abs, rel: relPosix(rootDir, abs), size: stat.size, mtimeMs: stat.mtimeMs };
      } catch {
        return { abs, rel: relPosix(rootDir, abs), size: -1, mtimeMs: -1 };
      }
    }),
  );
  stage = traceAt("load-cache", stage);
  const hits = new Map<string, ParsedCacheEntry>();
  const stale: string[] = [];
  const parsed = new Map<string, ParsedFile>();
  /** Set when an entry needs persisting (miss, mtime refresh, or drift). */
  let dirty = false;

  for (const state of states) {
    const entry = cached.get(state.rel);
    if (
      entry !== undefined &&
      entry.size === state.size &&
      entry.mtimeMs === state.mtimeMs &&
      state.mtimeMs > 0
    ) {
      hits.set(state.rel, entry);
      parsed.set(state.rel, { ...entry.parsed, path: state.abs });
      continue;
    }

    let hash = "";
    try {
      hash = await contentHash(state.abs);
    } catch {
      /* unreadable file: hash stays "" and the entry is re-parsed */
    }

    if (entry !== undefined && entry.hash === hash) {
      if (entry.mtimeMs !== state.mtimeMs || entry.size !== state.size) {
        hits.set(state.rel, { ...entry, size: state.size, mtimeMs: state.mtimeMs });
        dirty = true;
      } else {
        hits.set(state.rel, entry);
      }
      parsed.set(state.rel, { ...entry.parsed, path: state.abs });
    } else {
      stale.push(state.abs);
      dirty = true;
    }
  }

  if (stale.length > 0) {
    for (const filePath of stale) {
      project.getSourceFile(filePath)?.forget();
    }
    for (const parsedFile of parseMany(project, stale)) {
      parsed.set(relPosix(rootDir, parsedFile.path), parsedFile);
    }
  }
  traceAt("freshness+parse", stage);

  if (dirty) {
    const next = new Map<string, ParsedCacheEntry>(hits);
    for (const parsedFile of parsed.values()) {
      const rel = relPosix(rootDir, parsedFile.path);
      if (next.has(rel)) continue;
      const state = states.find((candidate) => candidate.rel === rel);
      let hash = "";
      try {
        hash = await contentHash(parsedFile.path);
      } catch {
        /* unreadable file: hash stays "" */
      }
      next.set(rel, {
        hash,
        size: state?.size ?? -1,
        mtimeMs: state?.mtimeMs ?? -1,
        parsed: { ...parsedFile, path: rel },
      });
    }
    await saveParsedCache(rootDir, configHash, next);
    traceAt("save", stage);
  }

  const parsedFiles = filePaths.map((abs) => {
    const rel = relPosix(rootDir, abs);
    const parsedFile = parsed.get(rel);
    if (parsedFile === undefined) {
      return {
        path: abs,
        kind: "ts" as const,
        imports: [],
        exports: { named: [], hasDefault: false, reExportedFrom: [], reExportedAll: [] },
        symbols: { functions: [], classes: [], interfaces: [], enums: [], typeAliases: [] },
        parseError: "file disappeared during discovery",
      };
    }
    return parsedFile;
  });

  return {
    parsedFiles,
    stats: { hits: hits.size, misses: stale.length },
  };
}
