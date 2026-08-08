/**
 * GitHub Actions workflow-command output for `ripple diff --format github`.
 *
 * One line per changed source file (`::error` when it blocks the gate,
 * `::warning` otherwise), plus a `::notice` verdict line. GitHub annotates
 * each `file=` directly on the PR's Files tab, and the exit code still
 * carries the gate verdict for CI.
 *
 * Escaping follows the workflow-command rules: properties escape `%`, `\r`,
 * `\n`, `:`, `,`; messages escape `%`, `\r`, `\n`.
 */
import type { AnalysisResult } from "../types/analysis.js";
import type { DiffCounts } from "../commands/diff.js";
import type { GateLevel } from "../types/output.js";
import type { RiskLevel } from "../types/risk.js";

export type AnnotationLevel = "error" | "warning" | "notice";

export interface AnnotationLine {
  level: AnnotationLevel;
  /** Absolute or repo-relative path shown in the annotation. */
  file?: string;
  title: string;
  message: string;
}

const LEVEL_INDEX: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

const GATE_INDEX: Record<GateLevel, number> = { medium: 1, high: 2, critical: 3 };

function escapeProperty(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function escapeMessage(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Render one line of workflow-command output. */
export function renderAnnotation(annotation: AnnotationLine): string {
  const props = annotation.file
    ? ` file=${escapeProperty(annotation.file)},title=${escapeProperty(annotation.title)}`
    : ` title=${escapeProperty(annotation.title)}`;
  return `::${annotation.level}${props}::${escapeMessage(annotation.message)}`;
}

/** Per-file annotations for analyzed results, errors first when blocking. */
export function buildFileAnnotations(
  files: Array<{ file: string; result: AnalysisResult }>,
  gate: GateLevel,
): AnnotationLine[] {
  return files.map(({ file, result }) => {
    const blocked = LEVEL_INDEX[result.risk.level] >= GATE_INDEX[gate];
    return {
      level: blocked ? "error" : "warning",
      file,
      title: `Ripple ${result.risk.level}`,
      message: `${result.risk.level} risk (score ${result.risk.score}) — ${result.summary.affectedFiles} affected ${
        result.summary.affectedFiles === 1 ? "file" : "files"
      }`,
    };
  });
}

/** One-line gate verdict for the workflow log. */
export function buildGateAnnotation(
  blocked: boolean,
  gate: GateLevel,
  counts: DiffCounts,
): AnnotationLine {
  const gateIndex = GATE_INDEX[gate];
  const parts: string[] = [];
  if (LEVEL_INDEX.CRITICAL >= gateIndex && counts.critical > 0)
    parts.push(`${counts.critical} CRITICAL`);
  if (LEVEL_INDEX.HIGH >= gateIndex && counts.high > 0) parts.push(`${counts.high} HIGH`);
  if (LEVEL_INDEX.MEDIUM >= gateIndex && counts.medium > 0) parts.push(`${counts.medium} MEDIUM`);
  const atGate = parts.length > 0 ? parts.join(" · ") : "none";
  return {
    level: "notice",
    title: `Ripple diff ${gate} gate`,
    message: blocked
      ? `Gate blocked: ${atGate} at or above ${gate}`
      : `Gate passed: nothing at ${gate} or above`,
  };
}
