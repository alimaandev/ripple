import chalk from "chalk";
import { loadProjectContext } from "../config/loader.js";
import { createStageTracker } from "../ui/progress.js";
import { resolveColor } from "../ui/color.js";
import { changedFiles } from "../git/changed.js";
import { brandHeader, sectionHeader } from "../ui/brand.js";
import { riskGauge } from "../ui/gauge.js";
import { icon } from "../ui/icons.js";
import {
  dim,
  formatDuration,
  pluralize,
  riskBadge,
  strong,
  type TextStyle,
} from "../formatter/text.js";
import { serializeJson } from "../formatter/json.js";
import { buildDiffSarif } from "../formatter/sarif.js";
import {
  buildFileAnnotations,
  buildGateAnnotation,
  renderAnnotation,
} from "../formatter/annotations.js";
import {
  evaluateGate,
  GATE_INDEX,
  LEVEL_INDEX,
  riskySummary,
  VERDICT_NOTE,
  type DiffCounts,
} from "./gate.js";
import { runPipeline } from "./pipeline.js";
import { displayPath } from "../utils/paths.js";
import { ExitCode } from "../types/cli.js";
import type { AnalysisResult } from "../types/analysis.js";
import type { CommandContext, DiffOptions, OutputWriter } from "../types/cli.js";
import type { DiffFileReport, DiffJsonReport, GateLevel } from "../types/output.js";

export {
  countLevels,
  isAllowedByDiffAllowlist,
  LEVEL_INDEX,
  GATE_INDEX,
  riskySummary,
  VERDICT_NOTE,
  type DiffCounts,
} from "./gate.js";

/**
 * `ripple diff`
 *
 * Analyzes every changed file since a base git ref and gates the change set:
 * if any changed source file reaches the gate level (HIGH by default), the
 * command exits 1 so CI can block a merge; otherwise it exits 0.
 */

export async function diffCommand(options: DiffOptions, ctx: CommandContext): Promise<ExitCode> {
  const format = options.format ?? (options.json ? "json" : "terminal");
  const style: TextStyle = { color: resolveColor(options.color) };
  const tracker = createStageTracker(format === "terminal");
  const started = Date.now();

  const context = await loadProjectContext(ctx.cwd, options.config);
  const gate = options.gate ?? context.config.diff.gate ?? "high";
  const base = options.base ?? context.config.diff.base;

  tracker.next("Resolving git changes");
  const changed = changedFiles(ctx.cwd, base);

  tracker.next("Analyzing changed files");
  const { graph, entryPoints } = await runPipeline(context);
  const allowPatterns = [...(options.allow ?? []), ...(context.config.diff.allow ?? [])];
  const evaluation = evaluateGate({
    context,
    graph,
    entryPoints,
    changed,
    gate,
    allowPatterns,
    ...(options.depth !== undefined ? { maxDepth: options.depth } : {}),
  });
  tracker.done();

  const { changes, entries, skipped, counts, allowedCount, blocked } = evaluation;
  const byRel = new Map<string, AnalysisResult>(entries.map((entry) => [entry.file, entry.result]));
  const allowedByRel = new Map<string, boolean>(
    entries.map((entry) => [entry.file, entry.allowed]),
  );
  const changedNames = changes.map((change) => change.file);
  const durationMs = Date.now() - started;

  if (format === "json") {
    ctx.writer.write(
      serializeJson(
        buildDiffJsonReport(
          changed.baseLabel,
          changedNames,
          byRel,
          allowedByRel,
          gate,
          blocked,
          counts,
          allowedCount,
          durationMs,
          ctx.version,
        ),
      ),
    );
    return blocked ? ExitCode.Failure : ExitCode.Success;
  }

  if (format === "sarif") {
    ctx.writer.write(
      serializeJson(
        buildDiffSarif({
          baseLabel: changed.baseLabel,
          entries: entries.map((entry) => ({
            rel: entry.file,
            repoRel: entry.repoPath,
            result: entry.result,
            allowed: entry.allowed,
          })),
          gate,
          counts,
          blocked,
          durationMs,
          version: ctx.version,
        }),
      ),
    );
    return blocked ? ExitCode.Failure : ExitCode.Success;
  }

  if (format === "github") {
    const annotations = [
      ...buildFileAnnotations(
        entries
          .filter((entry) => !entry.allowed)
          .map((entry) => ({ file: entry.repoPath, result: entry.result })),
        gate,
      ),
      buildGateAnnotation(blocked, gate, counts),
    ];
    ctx.writer.write(`${annotations.map(renderAnnotation).join("\n")}\n`);
    return blocked ? ExitCode.Failure : ExitCode.Success;
  }

  renderDiffReport(
    {
      cwd: ctx.cwd,
      baseLabel: changed.baseLabel,
      files: changedNames,
      entries: entries.map((entry) => ({
        rel: entry.file,
        result: entry.result,
        allowed: entry.allowed,
      })),
      skipped: skipped.map((change) => change.file),
      counts,
      allowedCount,
      gate,
      blocked,
      durationMs,
      style,
      verbose: options.verbose,
    },
    ctx.writer,
  );
  return blocked ? ExitCode.Failure : ExitCode.Success;
}

export interface DiffRenderInput {
  /** Working directory used to relativize displayed paths. */
  cwd: string;
  baseLabel: string;
  files: string[];
  entries: Array<{ rel: string; result: AnalysisResult; allowed: boolean }>;
  skipped: string[];
  counts: DiffCounts;
  allowedCount: number;
  gate: GateLevel;
  blocked: boolean;
  durationMs: number;
  style: TextStyle;
  /** Print per-file impact detail under each risk row. */
  verbose?: boolean;
}

export function renderDiffReport(input: DiffRenderInput, writer: OutputWriter): void {
  const {
    cwd,
    baseLabel,
    files,
    entries,
    skipped,
    counts,
    allowedCount,
    gate,
    blocked,
    durationMs,
    style,
    verbose = false,
  } = input;

  writer.writeLine(brandHeader({ label: `diff vs ${baseLabel}`, style }));
  writer.writeLine();

  const rows: Array<[string, string]> = [
    ["Changed", pluralize(files.length, "file")],
    ["Source", pluralize(entries.length, "file")],
    ["Allowed", pluralize(allowedCount, "file")],
    ["Duration", dim(formatDuration(durationMs), style)],
  ];
  const width = Math.max(...rows.map(([key]) => key.length));
  for (const [key, value] of rows) {
    writer.writeLine(`${key.padEnd(width)}  ${value}`);
  }
  writer.writeLine();

  const mark = blocked ? icon("cross") : icon("tick");
  const color = blocked ? chalk.red : chalk.green;
  const markText = style.color ? color(mark) : mark;
  const verdict = blocked ? "Gate blocked" : "Gate passed";
  const verdictText = style.color ? color(strong(verdict, style)) : verdict;
  writer.writeLine(
    `${markText} ${verdictText} — ${riskySummary(counts, gate)} ${dim(`(${VERDICT_NOTE[gate]})`, style)}`,
  );
  writer.writeLine();

  writer.writeLine(sectionHeader(`Risk analysis (${entries.length} files)`, style));
  for (const { result, allowed } of entries) {
    const risky = LEVEL_INDEX[result.risk.level] >= GATE_INDEX[gate];
    const fileIcon = risky ? icon("cross") : icon("tick");
    const fileIconText = style.color
      ? risky
        ? chalk.red(fileIcon)
        : chalk.green(fileIcon)
      : fileIcon;
    const score = result.risk.score.toFixed(1);
    const gauge = riskGauge(result.risk.score, result.risk.level, style);
    const file = displayPath(result.targetPath, cwd);
    const allowedTag = allowed ? ` ${dim("(allowed)", style)}` : "";
    writer.writeLine(
      `${fileIconText} ${file}  ${riskBadge(result.risk.level, style)} · ${score}/100${gauge ? ` ${gauge}` : ""}${allowedTag}`,
    );
    if (verbose) {
      writer.writeLine(
        `  ${dim(
          `${pluralize(result.summary.affectedFiles, "file")} affected · max depth ${result.summary.maxDepth} · confidence ${result.summary.confidence}%`,
          style,
        )}`,
      );
    }
  }
  // skipped files
  for (const rel of skipped) {
    writer.writeLine(
      `${dim(icon("ellipsis"), style)} ${dim(rel, style)} ${dim("(not a source file)", style)}`,
    );
  }
  writer.writeLine();
}

export function buildDiffJsonReport(
  baseLabel: string,
  changedFileNames: string[],
  byRel: Map<string, AnalysisResult>,
  allowedByRel: Map<string, boolean>,
  gate: GateLevel,
  blocked: boolean,
  counts: DiffCounts,
  allowedCount: number,
  durationMs: number,
  version: string,
): DiffJsonReport {
  const files: DiffFileReport[] = [];
  for (const rel of changedFileNames) {
    const result = byRel.get(rel);
    if (result) {
      files.push({
        file: rel,
        analyzed: true,
        risk: result.risk,
        affectedFiles: result.summary.affectedFiles,
        targetInCycle: result.targetInCycle,
        allowed: allowedByRel.get(rel) ?? false,
      });
    } else {
      files.push({ file: rel, analyzed: false });
    }
  }
  files.sort((a, b) => (b.risk?.score ?? -1) - (a.risk?.score ?? -1));

  return {
    tool: "ripple",
    version,
    command: "diff",
    base: baseLabel,
    changedFiles: changedFileNames.length,
    files,
    gate: { level: gate, blocked, counts, allowed: allowedCount },
    durationMs,
  };
}
