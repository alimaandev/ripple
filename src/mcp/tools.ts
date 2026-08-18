import path from "node:path";
import { analyzeFile } from "../analyzer/analyze.js";
import type { ProjectContext } from "../types/project.js";
import type { DependencyGraph } from "../types/graph.js";
import type { AnalysisResult } from "../types/analysis.js";
import { pathKey } from "../utils/paths.js";
import type { ChangedFiles } from "../git/changed.js";
import type { McpTool, McpToolResult } from "./server.js";
import { RippleError } from "../utils/errors.js";
import { ExitCode } from "../types/cli.js";

/**
 * The `ripple mcp` tool set. Each tool is a thin, deterministic wrapper over
 * the same analysis pipeline the CLI uses, returning JSON text so AI clients
 * can reason over exact numbers.
 */

export interface ProjectSnapshot {
  context: ProjectContext;
  graph: DependencyGraph;
  entryPoints: Set<string>;
}

export interface McpToolDeps {
  cwd: string;
  loadProject: () => Promise<ProjectSnapshot>;
  getChanged: (base?: string) => ChangedFiles;
}

const MAX_DEPENDENTS = 200;

function ok(text: string): McpToolResult {
  return { text };
}

function fail(error: unknown): McpToolResult {
  return { text: error instanceof Error ? error.message : "Tool failed", isError: true };
}

/** Validate a required string argument. */
function requireString(args: Record<string, unknown>, key: string, tool: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new RippleError(`Missing required argument "${key}" for ${tool}`, ExitCode.Failure);
  }
  return value;
}

function optionalPositiveInt(
  args: Record<string, unknown>,
  key: string,
  tool: string,
): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new RippleError(
      `Argument "${key}" for ${tool} must be a positive integer`,
      ExitCode.Failure,
    );
  }
  return value;
}

function resolveFile(cwd: string, file: string): string {
  return path.isAbsolute(file) ? file : path.join(cwd, file);
}

function analyzeIn(
  project: ProjectSnapshot,
  cwd: string,
  file: string,
  maxDepth?: number,
): AnalysisResult {
  const { context, graph, entryPoints } = project;
  const targetPath = resolveFile(cwd, file);
  const key = pathKey(targetPath, context.rootDir);
  const node = graph.nodes.get(key);
  if (!node) {
    throw new RippleError(
      `File not found in the project graph: ${file}. Is it a source file covered by ripple's discovery?`,
      ExitCode.NotFound,
    );
  }
  return analyzeFile({
    graph,
    context,
    entryPoints,
    targetKey: key,
    targetPath,
    durationMs: 0,
    ...(maxDepth !== undefined ? { maxDepth } : {}),
  });
}

function relPath(targetPath: string, cwd: string): string {
  const rel = targetPath.slice(cwd.length).replace(/^[/\\]+/, "");
  return (rel || targetPath).replace(/\\/g, "/");
}

const IMPACT_SCHEMA = {
  type: "object",
  properties: {
    file: {
      type: "string",
      description: "Project-relative or absolute path of the file to analyze.",
    },
    maxDepth: {
      type: "integer",
      minimum: 1,
      description: "Cap the reverse traversal depth (default: unlimited).",
    },
  },
  required: ["file"],
} satisfies Record<string, unknown>;

const DEPENDENTS_SCHEMA = {
  type: "object",
  properties: {
    file: {
      type: "string",
      description: "Project-relative or absolute path of the file.",
    },
    depth: {
      type: "integer",
      minimum: 1,
      description: "Max dependency depth to report (default: 1, direct dependents only).",
    },
  },
  required: ["file"],
} satisfies Record<string, unknown>;

const RISK_SCHEMA = {
  type: "object",
  properties: {
    file: {
      type: "string",
      description: "Project-relative or absolute path of the file.",
    },
  },
  required: ["file"],
} satisfies Record<string, unknown>;

const GATE_SCHEMA = {
  type: "object",
  properties: {
    base: {
      type: "string",
      description: "Git ref to diff against (default: origin/main, main, or HEAD~1).",
    },
    gate: {
      type: "string",
      enum: ["medium", "high", "critical"],
      description: "Risk level that blocks the merge (default: high).",
    },
  },
} satisfies Record<string, unknown>;

const LEVEL_INDEX: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export function createMcpTools(deps: McpToolDeps): McpTool[] {
  const { cwd, loadProject, getChanged } = deps;

  return [
    {
      name: "impact",
      description:
        "Blast-radius analysis of a file: how many files, routes, tests and components would be affected by changing it, plus its risk score. Call before editing or refactoring a file so the change set stays low-risk.",
      inputSchema: IMPACT_SCHEMA,
      handler: async (args) => {
        try {
          const file = requireString(args, "file", "impact");
          const maxDepth = optionalPositiveInt(args, "maxDepth", "impact");
          const project = await loadProject();
          const result = analyzeIn(project, cwd, file, maxDepth);
          return ok(
            JSON.stringify(
              {
                file: relPath(result.targetPath, cwd),
                risk: { score: result.risk.score, level: result.risk.level },
                summary: result.summary,
                targetInCycle: result.targetInCycle,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "dependents",
      description:
        "List the files that depend on a file (its importers), up to a depth. Depth 1 is direct dependents; deeper levels are transitive. Useful to know who breaks when the file changes.",
      inputSchema: DEPENDENTS_SCHEMA,
      handler: async (args) => {
        try {
          const file = requireString(args, "file", "dependents");
          const depth = optionalPositiveInt(args, "depth", "dependents") ?? 1;
          const project = await loadProject();
          const result = analyzeIn(project, cwd, file);
          const dependents = [...result.affected.values()]
            .filter((affected) => affected.depth <= depth)
            .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path))
            .map((affected) => ({
              path: relPath(affected.path, cwd),
              depth: affected.depth,
              direct: affected.direct,
              inCycle: affected.inCycle,
              categories: affected.categories,
            }));
          return ok(
            JSON.stringify(
              {
                file: relPath(result.targetPath, cwd),
                depth,
                count: dependents.length,
                truncated: dependents.length > MAX_DEPENDENTS,
                dependents: dependents.slice(0, MAX_DEPENDENTS),
              },
              null,
              2,
            ),
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "risk",
      description:
        "The risk score (0-100) of changing a file and the factor breakdown behind it. Cheap way to compare the danger of different refactor targets.",
      inputSchema: RISK_SCHEMA,
      handler: async (args) => {
        try {
          const file = requireString(args, "file", "risk");
          const project = await loadProject();
          const result = analyzeIn(project, cwd, file);
          return ok(
            JSON.stringify(
              {
                file: relPath(result.targetPath, cwd),
                score: result.risk.score,
                level: result.risk.level,
                targetInCycle: result.targetInCycle,
                factors: result.risk.factors,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "gate_status",
      description:
        "Check the current change set against the ripple merge gate: which files changed since the base ref, their risk levels, and whether the gate passes or blocks. Call after editing files to verify the changes are safe to merge.",
      inputSchema: GATE_SCHEMA,
      handler: async (args) => {
        try {
          const base = args.base;
          const gate = args.gate;
          if (base !== undefined && typeof base !== "string") {
            return fail(
              new RippleError('Argument "base" for gate_status must be a string', ExitCode.Failure),
            );
          }
          if (gate !== undefined && gate !== "medium" && gate !== "high" && gate !== "critical") {
            return fail(
              new RippleError(
                'Argument "gate" for gate_status must be medium | high | critical',
                ExitCode.Failure,
              ),
            );
          }
          const changed = getChanged(base);
          const project = await loadProject();
          const resolvedGate = gate ?? project.context.config.diff.gate ?? "high";
          const gateIndex = LEVEL_INDEX[resolvedGate.toUpperCase()] ?? 3;

          const files: Array<Record<string, unknown>> = [];
          const counts = { low: 0, medium: 0, high: 0, critical: 0 };
          let blocked = false;
          for (const rel of changed.files) {
            try {
              const result = analyzeIn(project, cwd, rel);
              const level = result.risk.level;
              counts[level.toLowerCase() as keyof typeof counts] += 1;
              if ((LEVEL_INDEX[level] ?? 1) >= gateIndex) blocked = true;
              files.push({
                file: rel,
                analyzed: true,
                level,
                score: result.risk.score,
                affectedFiles: result.summary.affectedFiles,
                targetInCycle: result.targetInCycle,
              });
            } catch {
              files.push({ file: rel, analyzed: false });
            }
          }

          return ok(
            JSON.stringify(
              {
                base: changed.baseLabel,
                changedFiles: changed.files.length,
                files,
                counts,
                gate: { level: resolvedGate, blocked, verdict: blocked ? "block" : "pass" },
              },
              null,
              2,
            ),
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
