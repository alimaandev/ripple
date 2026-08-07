import type { DependencyGraph } from "./graph.js";
import type { RiskResult } from "./risk.js";

/**
 * Result of the impact analysis for a target file.
 */

/** File categories derived from path and symbol heuristics. */
export type Category = "route" | "test" | "component" | "utility" | "entry" | "other";

/** One affected file found by the reverse traversal. */
export interface AffectedFile {
  /** Absolute path. */
  path: string;
  /** Distance (in import hops) from the analyzed file. Direct dependents are 1. */
  depth: number;
  /** Whether the file imports the analyzed file directly. */
  direct: boolean;
  /** All categories the file matched. */
  categories: Category[];
  /** Whether the file is part of a circular dependency. */
  inCycle: boolean;
}

/** Aggregated counters over all affected files. */
export interface ImpactSummary {
  /** Unique affected files (the analyzed file itself excluded). */
  affectedFiles: number;
  routes: number;
  tests: number;
  components: number;
  utilities: number;
  entries: number;
  /** Deepest dependency level reached. */
  maxDepth: number;
  /** Top directory clusters sorted by affected file count. */
  topImpact: TopImpactArea[];
  /** 0-100, how much of the graph could be resolved reliably. */
  confidence: number;
}

export interface TopImpactArea {
  /** Human-readable area name derived from the directory segment. */
  label: string;
  /** Number of affected files inside that area. */
  count: number;
}

/** Everything the `analyze` command needs to render output. */
export interface AnalysisResult {
  /** Absolute path of the analyzed file. */
  targetPath: string;
  /** Project root the analysis ran against. */
  rootDir: string;
  graph: DependencyGraph;
  /** Target file excluded. Keyed by absolute path. */
  affected: Map<string, AffectedFile>;
  summary: ImpactSummary;
  risk: RiskResult;
  /** Whether the target participates in a circular dependency. */
  targetInCycle: boolean;
  /** Deepest dependency level reached. */
  maxDepth: number;
  /** Wall time of the analysis in milliseconds. */
  durationMs: number;
}
