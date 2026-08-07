import type { AnalysisResult } from "../types/analysis.js";
import type { AnalyzeJsonReport, GraphJsonReport } from "../types/output.js";
import type { OutputWriter } from "../types/cli.js";
import type { DependencyGraph, GraphStats } from "../types/graph.js";
import { displayPath } from "../utils/paths.js";
import { renderKeyValue, renderTable, type TableColumn } from "../formatter/table.js";
import { renderTree, type TreeNode } from "../formatter/tree.js";
import {
  confidenceText,
  dim,
  formatDuration,
  pluralize,
  riskBadge,
  strong,
  type TextStyle,
} from "../formatter/text.js";
import { brandHeader, sectionHeader } from "../ui/brand.js";
import { riskGauge } from "../ui/gauge.js";
import { icon } from "../ui/icons.js";

/**
 * Report rendering. Terminal output is built here; JSON payloads are built
 * as plain data and serialized by `src/formatter/json.ts`.
 */

export interface ReportOptions {
  /** Working directory used to relativize display paths. */
  cwd: string;
  /** Whether to emit ANSI colors and styled layout. */
  color: boolean;
  /** Extra sections (risk factor breakdown). */
  verbose: boolean;
  /** Package version shown in the header card. */
  version?: string;
  /** Cap on affected files listed in the terminal tree. */
  listLimit?: number;
}

const DEFAULT_LIST_LIMIT = 20;

const textStyle = (options: ReportOptions): TextStyle => ({ color: options.color });

/** Project-relative path for display, with optional depth/cycle suffixes. */
function fileLabel(filePath: string, depth: number, inCycle: boolean, style: TextStyle): string {
  const parts: string[] = [dim(filePath, style)];
  if (depth >= 0) parts.push(dim(`· depth ${depth}`, style));
  if (inCycle) parts.push(dim("· cycle", style));
  return parts.join(" ");
}

/** Impact categories inline, e.g. `4 routes · 2 components · 1 test`. */
function impactLine(result: AnalysisResult, style: TextStyle): string {
  const { summary } = result;
  const parts: string[] = [];
  if (summary.routes > 0) parts.push(pluralize(summary.routes, "route"));
  if (summary.components > 0) parts.push(pluralize(summary.components, "component"));
  if (summary.tests > 0) parts.push(pluralize(summary.tests, "test"));
  if (summary.utilities > 0) parts.push(pluralize(summary.utilities, "utility"));
  return parts.length > 0 ? parts.join(" · ") : dim("none", style);
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

/** Render the full `ripple analyze` terminal report. */
export function renderAnalyzeReport(
  result: AnalysisResult,
  options: ReportOptions,
  writer: OutputWriter,
): void {
  const style = textStyle(options);
  const { summary, risk } = result;
  const file = displayPath(result.targetPath, options.cwd);

  writer.writeLine(brandHeader({ label: "impact analysis", version: options.version, style }));
  writer.writeLine();

  const score = risk.score.toFixed(1);
  const gauge = riskGauge(risk.score, risk.level, style);
  const rows: Array<[string, string]> = [
    ["File", file],
    ["Risk", `${riskBadge(risk.level, style)} · ${score}/100${gauge ? ` ${gauge}` : ""}`],
    ["Impact", impactLine(result, style)],
    ["Affected", pluralize(summary.affectedFiles, "file")],
    ["Max depth", String(summary.maxDepth)],
    ["Confidence", confidenceText(summary.confidence, style)],
    ["Duration", dim(formatDuration(result.durationMs), style)],
  ];
  const width = Math.max(...rows.map(([key]) => key.length));
  for (const [key, value] of rows) {
    writer.writeLine(`${key.padEnd(width)}  ${value}`);
  }
  writer.writeLine();

  writer.writeLine(sectionHeader("Top impact", style));
  for (const area of summary.topImpact) {
    writer.writeLine(
      `${icon("bullet")} ${strong(area.label, style)} ${dim(`(${area.count})`, style)}`,
    );
  }
  writer.writeLine();

  writer.writeLine(sectionHeader("Circular dependencies", style));
  if (result.graph.cycles.length === 0) {
    writer.writeLine(dim("none", style));
  } else {
    for (const cycle of result.graph.cycles) {
      const chain = cycle.path
        .map((key) => {
          const node = result.graph.nodes.get(key);
          return displayPath(node?.path ?? key, options.cwd);
        })
        .join(` ${icon("arrowRight")} `);
      writer.writeLine(`${icon("circle")} ${chain}`);
    }
  }
  writer.writeLine();

  if (summary.affectedFiles > 0) {
    writer.writeLine(sectionHeader(`Affected files (${summary.affectedFiles})`, style));
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
    writer.writeLine(sectionHeader("Risk factors", style));
    const columns: TableColumn[] = [
      { header: "Factor" },
      { header: "Weight" },
      { header: "Signal" },
      { header: "Points" },
    ];
    const rowsVerbose = risk.factors.map((factor) => [
      factor.label,
      factor.weight.toFixed(2),
      factor.value.toFixed(2),
      factor.contribution.toFixed(2),
    ]);
    writer.writeLine(renderTable(columns, rowsVerbose));
    writer.writeLine();
  }

  if (style.color) {
    writer.writeLine(
      dim(`${icon("info")} Tip: run "ripple doctor" to check project health`, style),
    );
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

  writer.writeLine(brandHeader({ label: "dependency graph", version: options.version, style }));
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
    writer.writeLine(sectionHeader("Dependants (forward)", style));
    writer.writeLine(renderTree(input.forward.map((path) => ({ label: path }))));
    writer.writeLine();
  }
  if (input.reverse) {
    writer.writeLine(sectionHeader("Dependents (reverse)", style));
    writer.writeLine(renderTree(input.reverse.map((path) => ({ label: path }))));
    writer.writeLine();
  }

  writer.writeLine(sectionHeader("Circular dependencies", style));
  if (input.cycles.length === 0) {
    writer.writeLine(dim("none", style));
  } else {
    for (const cycle of input.cycles) {
      const chain = cycle.path
        .map((key) => {
          const node = input.nodes.get(key);
          return displayPath(node?.path ?? key, input.cwd);
        })
        .join(` ${icon("arrowRight")} `);
      writer.writeLine(`${icon("circle")} ${chain}`);
    }
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
