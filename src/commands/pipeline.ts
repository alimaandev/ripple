import path from "node:path";
import { createTsProject } from "../parser/ts-project.js";
import { discoverSourceFiles } from "../scanner/discover.js";
import { buildGraphFromParsed } from "../graph/build.js";
import { loadParsedFiles } from "../cache/parsed.js";
import type { DependencyGraph } from "../types/graph.js";
import type { ProjectContext } from "../types/project.js";
import { detectEntryPoints } from "../analyzer/categorize.js";
import { pathKey, displayPath } from "../utils/paths.js";
import { fileNotFound } from "../utils/errors.js";

/**
 * Shared pipeline for commands that need the full dependency graph
 * (analyze, graph, diff, doctor). Loads context, discovers files, parses and
 * resolves everything into one graph, and detects entry points.
 *
 * Parsing is incremental: unchanged files are served from the on-disk cache
 * (`.ripple/cache/`), so repeated runs only re-parse what actually changed.
 * Resolution, cycles and stats are always recomputed from the parsed
 * surfaces, keeping cached output byte-identical to cold runs.
 */

export interface PipelineResult {
  graph: ReturnType<typeof buildGraphFromParsed>;
  filePaths: string[];
  entryPoints: Set<string>;
  durationMs: number;
}

export async function runPipeline(context: ProjectContext): Promise<PipelineResult> {
  const started = Date.now();
  const project = createTsProject();
  const filePaths = await discoverSourceFiles({
    rootDir: context.rootDir,
    include: context.config.include,
    ignore: context.config.ignore,
  });
  const { parsedFiles } = await loadParsedFiles({
    project,
    rootDir: context.rootDir,
    filePaths,
    config: context.config,
  });
  const graph = buildGraphFromParsed(parsedFiles, {
    rootDir: context.rootDir,
    aliases: context.aliases,
    fileKeys: new Set(filePaths.map((p) => pathKey(p, context.rootDir))),
  });
  const entryPoints = await detectEntryPoints(context.rootDir);
  return { graph, filePaths, entryPoints, durationMs: Date.now() - started };
}

/** Resolve the `<file>` argument to an absolute path (cwd-relative). */
export function resolveTargetFile(fileArg: string, cwd: string): string {
  return path.isAbsolute(fileArg) ? fileArg : path.join(cwd, fileArg);
}

/** Verify the target path is part of the graph; throws `RippleError`. */
export function requireNode(
  graph: DependencyGraph,
  targetPath: string,
  rootDir: string,
): { key: string } {
  const key = pathKey(targetPath, rootDir);
  if (!graph.nodes.has(key)) {
    throw fileNotFound(displayPath(targetPath, rootDir));
  }
  return { key };
}
