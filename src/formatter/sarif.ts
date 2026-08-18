import { createHash } from "node:crypto";
import type { AnalysisResult } from "../types/analysis.js";
import type { RiskLevel } from "../types/risk.js";
import type { DiffCounts } from "../commands/diff.js";
import type { GateLevel } from "../types/output.js";

/**
 * SARIF 2.1.0 output for `ripple diff --format sarif` and
 * `ripple analyze --sarif`.
 *
 * The payload is shaped for GitHub Code Scanning uploads (`gh codeql
 * upload-sarif` / `actions/upload-sarif`): every result carries a stable
 * `partialFingerprints.primaryLocationLineHash` so findings deduplicate
 * across runs, and allowlisted files are emitted at `note` with an in-source
 * suppression so they show as exempted rather than as errors.
 */

export type SarifLevel = "error" | "warning" | "note";

const LEVEL_INDEX: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

const GATE_INDEX: Record<GateLevel, number> = { medium: 1, high: 2, critical: 3 };

const INFORMATION_URI = "https://github.com/alimaandev/ripple";

/** Minimal structural typing for the SARIF 2.1.0 document we emit. */
export interface SarifDocument {
  $schema: string;
  version: string;
  runs: Array<{
    tool: { driver: Record<string, unknown> };
    results: Array<Record<string, unknown>>;
    properties?: Record<string, unknown>;
  }>;
}

/** Map a Ripple risk level to a SARIF severity. */
export function riskToSarifLevel(level: RiskLevel): SarifLevel {
  switch (level) {
    case "CRITICAL":
    case "HIGH":
      return "error";
    case "MEDIUM":
      return "warning";
    default:
      return "note";
  }
}

/** Stable per-file fingerprint so GitHub deduplicates findings across runs. */
export function primaryLocationHash(ruleId: string, uri: string, score: number): string {
  return createHash("sha256")
    .update(`${ruleId}|${uri}|${score.toFixed(1)}`)
    .digest("hex");
}

/** The single rule Ripple reports against. */
const RISK_RULE = {
  id: "ripple/risk",
  name: "riskScore",
  shortDescription: {
    text: "Risk of changing a file's blast radius",
  },
  fullDescription: {
    text: "Ripple scores how risky a change to a file is — its impact area, affected files, and circular-dependency membership — and gates merges on the resulting level.",
  },
  defaultConfiguration: { level: "warning" },
  properties: { tags: ["ripple", "impact-analysis"] },
};

interface DiffSarifEntry {
  rel: string;
  result: AnalysisResult;
  allowed: boolean;
}

/** File-level SARIF result for one analyzed file. */
function fileResult(entry: DiffSarifEntry, gate: GateLevel): Record<string, unknown> {
  const { rel, result, allowed } = entry;
  const level = allowed ? "note" : riskToSarifLevel(result.risk.level);
  const blocked = LEVEL_INDEX[result.risk.level] >= GATE_INDEX[gate];
  const score = result.risk.score.toFixed(1);
  const affected = result.summary.affectedFiles;
  const message = allowed
    ? `Allowlisted: ${result.risk.level} risk (${score}/100) - ${affected} affected file(s)`
    : `${result.risk.level} risk (${score}/100) - ${affected} affected file(s)`;

  const entryResult: Record<string, unknown> = {
    ruleId: "ripple/risk",
    level,
    message: { text: message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: rel },
          region: { startLine: 1 },
        },
      },
    ],
    partialFingerprints: {
      primaryLocationLineHash: primaryLocationHash("ripple/risk", rel, result.risk.score),
    },
    properties: {
      ripple: {
        score: result.risk.score,
        level: result.risk.level,
        affectedFiles: result.summary.affectedFiles,
        targetInCycle: result.targetInCycle,
        allowed,
        blocked,
        gate,
      },
    },
  };

  if (allowed) {
    entryResult.suppressions = [
      { kind: "inSource", justification: "Allowlisted via diff.allow in ripple config" },
    ];
  }

  return entryResult;
}

/**
 * Build the SARIF document for `ripple diff`. Analyzed files become results;
 * changed-but-skipped (non-source) files are omitted. The gate counts ride
 * along in `run.properties` so the Code Scanning result and the CI verdict
 * stay consistent.
 */
export function buildDiffSarif(options: {
  baseLabel: string;
  entries: DiffSarifEntry[];
  gate: GateLevel;
  counts: DiffCounts;
  blocked: boolean;
  durationMs: number;
  version: string;
}): SarifDocument {
  const { baseLabel, entries, gate, counts, blocked, durationMs, version } = options;
  const results = entries.map((entry) => fileResult(entry, gate));

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "ripple",
            fullName: "Ripple — dependency impact analysis",
            informationUri: INFORMATION_URI,
            version,
            rules: [RISK_RULE],
          },
        },
        results,
        properties: {
          ripple: {
            command: "diff",
            base: baseLabel,
            gate,
            blocked,
            counts,
            durationMs,
          },
        },
      },
    ],
  };
}

/** Build the SARIF document for `ripple analyze` (single-file result). */
export function buildAnalyzeSarif(options: {
  result: AnalysisResult;
  cwd: string;
  version: string;
}): SarifDocument {
  const { result, cwd, version } = options;
  const rel = result.targetPath
    .slice(cwd.length)
    .replace(/^[/\\]+/, "")
    .replace(/\\/g, "/");
  const uri = rel || result.targetPath;

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "ripple",
            fullName: "Ripple — dependency impact analysis",
            informationUri: INFORMATION_URI,
            version,
            rules: [RISK_RULE],
          },
        },
        results: [
          {
            ruleId: "ripple/risk",
            level: riskToSarifLevel(result.risk.level),
            message: {
              text: `${result.risk.level} risk (${result.risk.score.toFixed(1)}/100) - ${result.summary.affectedFiles} affected file(s)`,
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri },
                  region: { startLine: 1 },
                },
              },
            ],
            partialFingerprints: {
              primaryLocationLineHash: primaryLocationHash("ripple/risk", uri, result.risk.score),
            },
            properties: {
              ripple: {
                score: result.risk.score,
                level: result.risk.level,
                affectedFiles: result.summary.affectedFiles,
                targetInCycle: result.targetInCycle,
              },
            },
          },
        ],
      },
    ],
  };
}
