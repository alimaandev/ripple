import type { AnalysisResult } from "../types/analysis.js";
import type { AnalyzeJsonReport, GraphJsonReport } from "../types/output.js";
import type { OutputWriter } from "../types/cli.js";
import type { DependencyGraph, GraphStats } from "../types/graph.js";
import { displayPath } from "../utils/paths.js";
import { renderKeyValue, renderTable, type TableColumn } from "../formatter/table.js";
import { renderTree, type TreeNode } from "../formatter/tree.js";
import {
  banner,
  confidenceText,
  dim,
  formatDuration,
  pluralize,
  riskBadge,
  sectionTitle,
  strong,
  type TextStyle,
} from "../formatter/text.js";

/**
 * Report rendering. Terminal output is built here; JSON payloads are built
 * as plain data and serialized by `src/formatter/json.ts`.
 */

export interface ReportOptions {
  /** Working directory used to relativize display paths. */
  cwd: string;
  /** Whether to emit ANSI colors. */
  color: boolean;
  /** Extra sections (risk factor breakdown). */
  verbose: boolean;
  /** Cap on affected files listed in the terminal tree. */
  listLimit?: number;
}

const DEFAULT_LIST_LIMIT = 20;

const textStyle = (options: ReportOptions): TextStyle => ({ color: options.color });

/** Project-relative path for display, with an optional depth suffix. */
function fileLabel(filePath: string, depth: number, inCycle: boolean, style: TextStyle): string {
  const relative = dim(filePath, style);
  const depthSuffix = dim(`(depth ${depth})`, style);
  const cycleSuffix = dim("(cycle)", style);
  return `${relative} ${depthSuffix}${inCycle ? ` ${cycleSuffix}` : ""}`;
}

/** Build the affected-file tree: depth-1 files are roots, deeper files are
 * nested under the first (deterministic) affected importer. */
function buildAffectedTree(result: AnalysisResult, cwd: string, style: TextStyle): TreeNode[] {
  const { affected, graph } = result;
  const sorted = [...affected.entries()].sort(
    ([, a], [, b]) => a.depth - b.depth || a.path.localeCompare(b.path),
  );

  const nodesByKey = new Map<string, TreeNode & { children: TreeNode[] }>();
  const depthByKey = new Map<string, number>();
  for (const [key, file] of sorted) {
    const node: TreeNode & { children: TreeNode[] } = { label: "", children: [] };
    node.label = fileLabel(displayPath(file.path, cwd), file.depth, file.inCycle, style);
    nodesByKey.set(key, node);
    depthByKey.set(key, file.depth);
  }

  const roots: TreeNode[] = [];
  for (const [key, file] of sorted) {
    const node = nodesByKey.get(key);
    if (!node) continue;

    if (file.depth === 1) {
      roots.push(node);
      continue;
    }

    const importers = graph.reverse.get(key) ?? [];
    const parents = [...importers]
      .filter(
        (candidate) => depthByKey.get(candidate) === file.depth - 1 && nodesByKey.has(candidate),
      )
      .sort((a, b) => (depthByKey.get(a) ?? 0) - (depthByKey.get(b) ?? 0) || a.localeCompare(b));

    const parent = parents[0] ? nodesByKey.get(parents[0]) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Render the full `ripple analyze` terminal report.
 */
export function renderAnalyzeReport(
  result: AnalysisResult,
  options: ReportOptions,
  writer: OutputWriter,
): void {
  const style = textStyle(options);
  const { summary, risk } = result;
  const file = displayPath(result.targetPath, options.cwd);

  writer.writeLine(banner("🌊 Ripple Analysis", style));
  writer.writeLine();

  writer.writeLine(
    renderKeyValue([
      ["File", file],
      ["Risk", riskBadge(risk.level, style)],
      ["Affected Files", pluralize(summary.affectedFiles, "file")],
      ["Components", String(summary.components)],
      ["API Routes", String(summary.routes)],
      ["Tests", String(summary.tests)],
      ["Utilities", String(summary.utilities)],
      ["Max Depth", String(summary.maxDepth)],
      ["Confidence", confidenceText(summary.confidence, style)],
      ["Duration", dim(formatDuration(result.durationMs), style)],
    ]),
  );
  writer.writeLine();

  writer.writeLine(sectionTitle("Top Impact", style));
  for (const area of summary.topImpact) {
    writer.writeLine(`• ${strong(area.label, style)} ${dim(`(${area.count})`, style)}`);
  }
  writer.writeLine();

  writer.writeLine(sectionTitle("Circular Dependencies", style));
  if (result.graph.cycles.length === 0) {
    writer.writeLine(dim("none", style));
  } else {
    for (const cycle of result.graph.cycles) {
      const chain = cycle.path
        .map((key) => {
          const node = result.graph.nodes.get(key);
          return displayPath(node?.path ?? key, options.cwd);
        })
        .join(" → ");
      writer.writeLine(`⭕ ${chain}`);
    }
  }
  writer.writeLine();

  if (summary.affectedFiles > 0) {
    writer.writeLine(sectionTitle(`Affected Files (${summary.affectedFiles})`, style));
    const tree = buildAffectedTree(result, options.cwd, style);
    writer.writeLine(renderTree(tree));
    const limit = options.listLimit ?? DEFAULT_LIST_LIMIT;
    if (summary.affectedFiles > limit) {
      writer.writeLine(
        dim(`${summary.affectedFiles - limit} more… use --json for the full list`, style),
      );
    }
    writer.writeLine();
  }

  if (options.verbose) {
    writer.writeLine(sectionTitle("Risk Factors", style));
    const columns: TableColumn[] = [
      { header: "Factor" },
      { header: "Weight" },
      { header: "Signal" },
      { header: "Points" },
    ];
    const rows = risk.factors.map((factor) => [
      factor.label,
      factor.weight.toFixed(2),
      factor.value.toFixed(2),
      factor.contribution.toFixed(2),
    ]);
    writer.writeLine(renderTable(columns, rows));
    writer.writeLine();
  }
}

/** Build the machine-readable `analyze --json` payload. */
export function buildAnalyzeJsonReport(
  result: AnalysisResult,
  version: string,
  cwd: string,
): AnalyzeJsonReport {
  const realPath = (key: string): string => result.graph.nodes.get(key)?.path ?? key;

  const affected = [...result.affected.values()]
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path))
    .map((file) => ({ ...file, path: displayPath(file.path, cwd) }));

  return {
    tool: "ripple",
    version,
    command: "analyze",
    file: displayPath(result.targetPath, cwd),
    risk: result.risk,
    summary: result.summary,
    affected,
    cycles: result.graph.cycles.map((cycle) => ({
      members: cycle.members.map((key) => displayPath(realPath(key), cwd)),
      path: cycle.path.map((key) => displayPath(realPath(key), cwd)),
    })),
    targetInCycle: result.targetInCycle,
    durationMs: result.durationMs,
  };
}

export interface GraphReportInput {
  stats: GraphStats;
  cycles: DependencyGraph["cycles"];
  nodes: DependencyGraph["nodes"];
  cwd: string;
  /** For `ripple graph <file>`: forward and reverse file lists. */
  forward?: string[];
  reverse?: string[];
}

/** Render the `ripple graph` terminal report. */
export function renderGraphReport(
  input: GraphReportInput,
  options: ReportOptions,
  writer: OutputWriter,
): void {
  const style = textStyle(options);
  const { stats } = input;

  writer.writeLine(banner("🌊 Dependency Graph", style));
  writer.writeLine();

  writer.writeLine(
    renderKeyValue([
      ["Files", String(stats.files)],
      ["Edges", String(stats.internalEdges)],
      ["External", String(stats.externalEdges)],
      ["Unresolved", String(stats.unresolvedEdges)],
      ["Circular groups", String(stats.cycles)],
    ]),
  );
  writer.writeLine();

  if (input.forward) {
    writer.writeLine(sectionTitle("Dependants (forward)", style));
    writer.writeLine(renderTree(input.forward.map((path) => ({ label: path }))));
    writer.writeLine();
  }
  if (input.reverse) {
    writer.writeLine(sectionTitle("Dependents (reverse)", style));
    writer.writeLine(renderTree(input.reverse.map((path) => ({ label: path }))));
    writer.writeLine();
  }

  if (input.cycles.length > 0) {
    writer.writeLine(sectionTitle("Circular Dependencies", style));
    for (const cycle of input.cycles) {
      const chain = cycle.path
        .map((key) => {
          const node = input.nodes.get(key);
          return displayPath(node?.path ?? key, input.cwd);
        })
        .join(" → ");
      writer.writeLine(`⭕ ${chain}`);
    }
  } else {
    writer.writeLine(dim("No circular dependencies found.", style));
  }
}

/** Build the machine-readable `graph --json` payload. */
export function buildGraphJsonReport(input: GraphReportInput, version: string): GraphJsonReport {
  const realPath = (key: string): string => input.nodes.get(key)?.path ?? key;
  return {
    tool: "ripple",
    version,
    command: "graph",
    fileCount: input.stats.files,
    edgeCount: input.stats.internalEdges,
    externalEdgeCount: input.stats.externalEdges,
    cycles: input.cycles.map((cycle) => ({
      members: cycle.members.map((key) => displayPath(realPath(key), input.cwd)),
      path: cycle.path.map((key) => displayPath(realPath(key), input.cwd)),
    })),
    ...(input.forward ? { forward: input.forward } : {}),
    ...(input.reverse ? { reverse: input.reverse } : {}),
  };
}
