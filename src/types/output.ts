import type { AffectedFile, ImpactSummary } from "./analysis.js";
import type { Cycle } from "./graph.js";
import type { RiskResult } from "./risk.js";

/**
 * Machine-readable payload emitted by `ripple analyze --json`.
 * Stable shape: do not rename fields without a major version bump.
 */
export interface AnalyzeJsonReport {
  tool: "ripple";
  version: string;
  command: "analyze";
  /** Project-relative path of the analyzed file. */
  file: string;
  risk: RiskResult;
  summary: ImpactSummary;
  /** Affected files, sorted by depth then path. */
  affected: AffectedFile[];
  /** Ordered cycle paths that involve project files. */
  cycles: Cycle[];
  /** Whether the analyzed file is part of a cycle. */
  targetInCycle: boolean;
  durationMs: number;
}

/** Payload emitted by `ripple graph --json`. */
export interface GraphJsonReport {
  tool: "ripple";
  version: string;
  command: "graph";
  fileCount: number;
  edgeCount: number;
  externalEdgeCount: number;
  cycles: Cycle[];
  /** For `ripple graph <file>`: forward tree entries. */
  forward?: string[];
  reverse?: string[];
}

/** One analyzed file inside a `ripple diff` report. */
export interface DiffFileReport {
  /** Git-relative path of the changed file. */
  file: string;
  /** Whether the file is part of the analyzed source graph. */
  analyzed: boolean;
  risk?: RiskResult;
  affectedFiles?: number;
  targetInCycle?: boolean;
}

/** Minimum risk level that blocks the `ripple diff` gate. */
export type GateLevel = "medium" | "high" | "critical";

/** Payload emitted by `ripple diff --json`. */
export interface DiffJsonReport {
  tool: "ripple";
  version: string;
  command: "diff";
  /** Base ref the change set was computed against. */
  base: string;
  /** Total changed files detected by git. */
  changedFiles: number;
  /** Per-file analysis, risky files first. */
  files: DiffFileReport[];
  gate: {
    /** Minimum risk level that blocks the gate. */
    level: GateLevel;
    blocked: boolean;
    counts: Record<"low" | "medium" | "high" | "critical", number>;
  };
  durationMs: number;
}
