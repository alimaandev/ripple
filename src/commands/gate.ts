import path from "node:path";
import picomatch from "picomatch";
import { analyzeFile } from "../analyzer/analyze.js";
import type { AnalysisResult } from "../types/analysis.js";
import type { DependencyGraph } from "../types/graph.js";
import type { GateLevel } from "../types/output.js";
import type { ProjectContext } from "../types/project.js";
import type { RiskLevel } from "../types/risk.js";
import type { ChangedFiles } from "../git/changed.js";
import { pathKey, realPath, toPosix } from "../utils/paths.js";

/**
 * Shared diff-gate evaluation.
 *
 * Both `ripple diff` and the MCP `gate_status` tool must answer the same
 * question the same way: which changed files are in the graph, how risky are
 * they, which are allowlisted, and does the change set block. Keeping the
 * logic here prevents the two surfaces from drifting.
 */

export interface DiffCounts {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export const LEVEL_INDEX: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export const GATE_INDEX: Record<GateLevel, number> = { medium: 1, high: 2, critical: 3 };

export const VERDICT_NOTE: Record<GateLevel, string> = {
  medium: "no MEDIUM or worse",
  high: "no HIGH or CRITICAL",
  critical: "no CRITICAL",
};

export function countLevels(results: AnalysisResult[]): DiffCounts {
  const counts: DiffCounts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const result of results) {
    counts[result.risk.level.toLowerCase() as keyof DiffCounts] += 1;
  }
  return counts;
}

/**
 * Whether a project-relative path matches any of the diff allowlist globs.
 * Patterns and paths are normalized to forward slashes so the same config
 * works on Windows and POSIX.
 */
export function isAllowedByDiffAllowlist(relPath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const rel = toPosix(relPath);
  const matcher = picomatch(patterns.map(toPosix), { dot: true });
  return matcher(rel);
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

/** POSIX path relative to the project root (`.` for the root itself). */
export function projectRelativePath(absPath: string, rootDir: string): string {
  const rel = toPosix(path.relative(realPath(rootDir, rootDir), realPath(absPath, rootDir)));
  return rel === "" ? "." : rel;
}

/** One changed file, resolved against the repository and project roots. */
export interface EvaluatedChange {
  /** Project-root-relative POSIX path; used in reports and allowlist matching. */
  file: string;
  /** Repository-root-relative POSIX path exactly as git reported it. */
  repoPath: string;
  /** Absolute path on disk. */
  absPath: string;
  /** Analysis result, or `undefined` when the file is outside the graph. */
  result?: AnalysisResult;
  /** Whether the file matched the diff allowlist. */
  allowed: boolean;
}

export type AnalyzedChange = EvaluatedChange & { result: AnalysisResult };

export interface GateEvaluation {
  /** Every changed file, in the order git reported it. */
  changes: EvaluatedChange[];
  /** Analyzed files, riskiest first. */
  entries: AnalyzedChange[];
  /** Changed files that are not part of the analyzed source graph. */
  skipped: EvaluatedChange[];
  counts: DiffCounts;
  allowedCount: number;
  blocked: boolean;
  gate: GateLevel;
}

export interface GateEvaluationInput {
  context: ProjectContext;
  graph: DependencyGraph;
  entryPoints: Set<string>;
  changed: ChangedFiles;
  gate: GateLevel;
  /** CLI `--allow` globs plus `diff.allow`; project-root-relative. */
  allowPatterns: string[];
  maxDepth?: number;
}

/**
 * Resolve and analyze every changed file, then decide whether the gate
 * blocks. Paths are always resolved against `changed.repoRoot`, never the
 * process working directory, so monorepo subdirectory runs are correct.
 */
export function evaluateGate(input: GateEvaluationInput): GateEvaluation {
  const { context, graph, entryPoints, changed, gate, allowPatterns, maxDepth } = input;
  const changes: EvaluatedChange[] = [];
  const seen = new Set<string>();

  for (const repoPath of changed.files) {
    const gitPath = path.resolve(changed.repoRoot, repoPath);
    const file = projectRelativePath(gitPath, context.rootDir);
    // Re-anchor under the project root so graph keys and display paths use the
    // same path form as discovery (Windows may hand git a long path and this
    // process a short-name cwd).
    const absPath = file === "." ? context.rootDir : path.resolve(context.rootDir, file);
    const key = pathKey(absPath, context.rootDir);
    if (seen.has(key)) continue;
    seen.add(key);

    if (!graph.nodes.has(key)) {
      changes.push({ file, repoPath, absPath, allowed: false });
      continue;
    }

    const result = analyzeFile({
      graph,
      context,
      entryPoints,
      targetKey: key,
      targetPath: absPath,
      durationMs: 0,
      ...(maxDepth !== undefined ? { maxDepth } : {}),
    });
    changes.push({
      file,
      repoPath,
      absPath,
      result,
      allowed: isAllowedByDiffAllowlist(file, allowPatterns),
    });
  }

  const entries = changes
    .filter((change): change is AnalyzedChange => change.result !== undefined)
    .sort((a, b) => b.result.risk.score - a.result.risk.score || a.file.localeCompare(b.file));
  const skipped = changes.filter((change) => change.result === undefined);
  const gateResults = entries.filter((entry) => !entry.allowed).map((entry) => entry.result);
  const counts = countLevels(gateResults);
  const allowedCount = entries.filter((entry) => entry.allowed).length;
  const blocked = gateResults.some((result) => LEVEL_INDEX[result.risk.level] >= GATE_INDEX[gate]);

  return { changes, entries, skipped, counts, allowedCount, blocked, gate };
}
