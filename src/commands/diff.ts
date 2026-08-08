import path from "node:path";
import chalk from "chalk";
import { loadProjectContext } from "../config/loader.js";
import { analyzeFile } from "../analyzer/analyze.js";
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
import { runPipeline } from "./pipeline.js";
import { displayPath, pathKey } from "../utils/paths.js";
import { ExitCode } from "../types/cli.js";
import type { AnalysisResult } from "../types/analysis.js";
import type { CommandContext, DiffOptions, OutputWriter } from "../types/cli.js";
import type { DiffFileReport, DiffJsonReport, GateLevel } from "../types/output.js";
import type { RiskLevel } from "../types/risk.js";

/**
 * `ripple diff`
 *
 * Analyzes every changed file since a base git ref and gates the change set:
 * if any changed source file reaches the gate level (HIGH by default), the
 * command exits 1 so CI can block a merge; otherwise it exits 0.
 */

const LEVEL_INDEX: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

const GATE_INDEX: Record<GateLevel, number> = { medium: 1, high: 2, critical: 3 };

const VERDICT_NOTE: Record<GateLevel, string> = {
  medium: "no MEDIUM or worse",
  high: "no HIGH or CRITICAL",
  critical: "no CRITICAL",
};

export interface DiffCounts {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export function countLevels(results: AnalysisResult[]): DiffCounts {
  const counts: DiffCounts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const result of results) {
    counts[result.risk.level.toLowerCase() as keyof DiffCounts] += 1;
  }
  return counts;
}

/** `2 HIGH · 1 CRITICAL` — counts for levels at or above the gate. */
export function riskySummary(counts: DiffCounts, gate: GateLevel): string {
  const gateIndex = GATE_INDEX[gate];
  const parts: string[] = [];
  if (LEVEL_INDEX.CRITICAL >= gateIndex && counts.critical > 0)
    parts.push(`${counts.critical} CRITICAL`);
  if (LEVEL_INDEX.HIGH >= gateIndex && counts.high > 0) parts.push(`${counts.high} HIGH`);
  if (LEVEL_INDEX.MEDIUM >= gateIndex && counts.medium > 0) parts.push(`${counts.medium} MEDIUM`);
  if (LEVEL_INDEX.LOW >= gateIndex && counts.low > 0) parts.push(`${counts.low} LOW`);
  return parts.length > 0 ? parts.join(" · ") : "none";
}

export async function diffCommand(options: DiffOptions, ctx: CommandContext): Promise<ExitCode> {
  const style: TextStyle = { color: resolveColor(options.color) };
  const tracker = createStageTracker(!options.json);
  const started = Date.now();

  const context = await loadProjectContext(ctx.cwd, options.config);
  const gate = options.gate ?? context.config.diff.gate ?? "high";
  const base = options.base ?? context.config.diff.base;

  tracker.next("Resolving git changes");
  const changed = changedFiles(ctx.cwd, base);

  tracker.next("Analyzing changed files");
  const { graph, entryPoints } = await runPipeline(context);

  const byRel = new Map<string, AnalysisResult>();
  const skipped: string[] = [];
  for (const rel of changed.files) {
    const abs = path.resolve(ctx.cwd, rel);
    const key = pathKey(abs, context.rootDir);
    if (!graph.nodes.has(key)) {
      skipped.push(rel);
      continue;
    }
    byRel.set(
      rel,
      analyzeFile({
        graph,
        context,
        entryPoints,
        targetKey: key,
        targetPath: abs,
        durationMs: 0,
        ...(options.depth !== undefined ? { maxDepth: options.depth } : {}),
      }),
    );
  }
  tracker.done();

  const results = [...byRel.values()].sort((a, b) => b.risk.score - a.risk.score);
  const counts = countLevels(results);
  const blocked = results.some((result) => LEVEL_INDEX[result.risk.level] >= GATE_INDEX[gate]);
  const durationMs = Date.now() - started;

  if (options.json) {
    ctx.writer.write(
      serializeJson(
        buildDiffJsonReport(
          changed.baseLabel,
          changed.files,
          byRel,
          gate,
          blocked,
          counts,
          durationMs,
          ctx.version,
        ),
      ),
    );
    return blocked ? ExitCode.Failure : ExitCode.Success;
  }

  renderDiffReport(
    {
      cwd: ctx.cwd,
      baseLabel: changed.baseLabel,
      files: changed.files,
      results,
      skipped,
      counts,
      gate,
      blocked,
      durationMs,
      style,
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
  results: AnalysisResult[];
  skipped: string[];
  counts: DiffCounts;
  gate: GateLevel;
  blocked: boolean;
  durationMs: number;
  style: TextStyle;
}

export function renderDiffReport(input: DiffRenderInput, writer: OutputWriter): void {
  const { cwd, baseLabel, files, results, skipped, counts, gate, blocked, durationMs, style } =
    input;

  writer.writeLine(brandHeader({ label: `diff vs ${baseLabel}`, style }));
  writer.writeLine();

  const rows: Array<[string, string]> = [
    ["Changed", pluralize(files.length, "file")],
    ["Source", pluralize(results.length, "file")],
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

  writer.writeLine(sectionHeader(`Risk analysis (${results.length} files)`, style));
  for (const result of results) {
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
    writer.writeLine(
      `${fileIconText} ${file}  ${riskBadge(result.risk.level, style)} · ${score}/100${gauge ? ` ${gauge}` : ""}`,
    );
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
  gate: GateLevel,
  blocked: boolean,
  counts: DiffCounts,
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
    gate: { level: gate, blocked, counts },
    durationMs,
  };
}
