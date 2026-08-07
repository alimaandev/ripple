import { loadProjectContext } from "../config/loader.js";
import { createStageTracker } from "../ui/progress.js";
import { resolveColor } from "../ui/color.js";
import { buildGraphJsonReport, renderGraphReport } from "../output/report.js";
import { serializeJson } from "../formatter/json.js";
import { requireNode, resolveTargetFile, runPipeline } from "./pipeline.js";
import { displayPath } from "../utils/paths.js";
import { ExitCode } from "../types/cli.js";
import type { CommandContext, GraphOptions } from "../types/cli.js";
import type { DependencyGraph } from "../types/graph.js";

/**
 * `ripple graph [file]`
 *
 * Without a file: project-wide graph stats and circular dependencies.
 * With a file: the file's dependency tree — dependants (what it imports)
 * by default, or dependents (what imports it) with `--reverse`.
 */

interface WalkNode {
  key: string;
  depth: number;
}

/** BFS walk over an edge map, depth-capped, sorted by depth then path. */
function walk(
  graph: DependencyGraph,
  startKey: string,
  edges: Map<string, Set<string>>,
  maxDepth: number | undefined,
  cwd: string,
): string[] {
  const seen = new Set<string>([startKey]);
  const queue: WalkNode[] = [{ key: startKey, depth: 0 }];
  const entries: Array<{ path: string; depth: number }> = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.key !== startKey) {
      const nodePath = graph.nodes.get(current.key)?.path ?? current.key;
      entries.push({ path: displayPath(nodePath, cwd), depth: current.depth });
    }
    if (maxDepth !== undefined && current.depth >= maxDepth) continue;

    for (const candidate of edges.get(current.key) ?? []) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      queue.push({ key: candidate, depth: current.depth + 1 });
    }
  }

  return entries
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path))
    .map((entry) => entry.path);
}

export async function graphCommand(
  fileArg: string | undefined,
  options: GraphOptions,
  ctx: CommandContext,
): Promise<ExitCode> {
  const tracker = createStageTracker(!options.json);
  tracker.next("Loading config");
  const cwd = ctx.cwd;

  try {
    const context = await loadProjectContext(cwd, options.config);

    tracker.next("Building graph");
    const { graph } = await runPipeline(context);

    const input = {
      stats: graph.stats,
      cycles: graph.cycles,
      nodes: graph.nodes,
      cwd,
    };

    if (!fileArg) {
      tracker.done();
      if (options.json) {
        const report = buildGraphJsonReport(input, ctx.version);
        ctx.writer.write(serializeJson(report));
      } else {
        renderGraphReport(
          input,
          {
            cwd,
            color: resolveColor(options.color),
            verbose: options.verbose,
            version: ctx.version,
          },
          ctx.writer,
        );
      }
      return ExitCode.Success;
    }

    const targetPath = resolveTargetFile(fileArg, cwd);
    const { key } = requireNode(graph, targetPath, context.rootDir);
    const dependants = walk(graph, key, graph.forward, options.depth, cwd);
    const dependents = walk(graph, key, graph.reverse, options.depth, cwd);

    tracker.done();

    if (options.json) {
      const report = buildGraphJsonReport(
        {
          ...input,
          ...(options.reverse ? { reverse: dependents } : { forward: dependants }),
        },
        ctx.version,
      );
      ctx.writer.write(serializeJson(report));
    } else {
      renderGraphReport(
        {
          ...input,
          forward: options.reverse ? undefined : dependants,
          reverse: options.reverse ? dependents : undefined,
        },
        { cwd, color: resolveColor(options.color), verbose: options.verbose, version: ctx.version },
        ctx.writer,
      );
    }
    return ExitCode.Success;
  } finally {
    tracker.done();
  }
}
