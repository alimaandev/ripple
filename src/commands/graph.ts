import { loadProjectContext } from "../config/loader.js";
import { createStageTracker } from "../ui/progress.js";
import { resolveColor } from "../ui/color.js";
import { buildGraphJsonReport, renderGraphReport } from "../output/report.js";
import { serializeJson } from "../formatter/json.js";
import {
  renderDotGraph,
  renderHtmlGraph,
  renderMermaidGraph,
  type GraphExportInput,
} from "../formatter/graph-export.js";
import { requireNode, resolveTargetFile, runPipeline } from "./pipeline.js";
import { displayPath } from "../utils/paths.js";
import { ExitCode, type GraphFormat } from "../types/cli.js";
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

/** Reachable subgraph from `startKey` (forward = what it imports, reverse =
 * what imports it), depth-capped. Used for file-scoped exports. */
function reachableSubgraph(
  graph: DependencyGraph,
  startKey: string,
  reverse: boolean,
  maxDepth: number | undefined,
  cwd: string,
): GraphExportInput {
  const edges = reverse ? graph.reverse : graph.forward;
  const nodes = new Map<string, string>();
  const visited = new Set<string>([startKey]);
  const queue: WalkNode[] = [{ key: startKey, depth: 0 }];
  const collectedEdges = new Map<string, Set<string>>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    nodes.set(current.key, graph.nodes.get(current.key)?.path ?? current.key);
    if (maxDepth !== undefined && current.depth >= maxDepth) continue;

    const targets = new Set<string>();
    for (const candidate of edges.get(current.key) ?? []) {
      targets.add(candidate);
      if (!visited.has(candidate)) {
        visited.add(candidate);
        queue.push({ key: candidate, depth: current.depth + 1 });
      }
    }
    if (targets.size > 0) collectedEdges.set(current.key, targets);
  }

  return { nodes, edges: collectedEdges, cycles: graph.cycles, cwd };
}

/** Render an export format (mermaid/dot/html) for a graph input. */
function writeExport(
  format: Exclude<GraphFormat, "terminal" | "json">,
  input: GraphExportInput,
  writer: CommandContext["writer"],
): void {
  const rendered =
    format === "mermaid"
      ? renderMermaidGraph(input)
      : format === "dot"
        ? renderDotGraph(input)
        : renderHtmlGraph(input);
  writer.write(rendered);
}

export async function graphCommand(
  fileArg: string | undefined,
  options: GraphOptions,
  ctx: CommandContext,
): Promise<ExitCode> {
  const format = options.format ?? (options.json ? "json" : "terminal");
  const tracker = createStageTracker(format === "terminal");
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

    if (format === "mermaid" || format === "dot" || format === "html") {
      let exportInput: GraphExportInput;
      if (fileArg) {
        const targetPath = resolveTargetFile(fileArg, cwd);
        const { key } = requireNode(graph, targetPath, context.rootDir);
        exportInput = reachableSubgraph(graph, key, options.reverse, options.depth, cwd);
      } else {
        const nodes = new Map<string, string>();
        for (const [key, node] of graph.nodes) nodes.set(key, node.path);
        exportInput = { nodes, edges: graph.forward, cycles: graph.cycles, cwd };
      }
      tracker.done();
      writeExport(format, exportInput, ctx.writer);
      return ExitCode.Success;
    }

    if (!fileArg) {
      tracker.done();
      if (format === "json") {
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

    if (format === "json") {
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
