import type { ImpactSummary } from "../types/analysis.js";
import type { RiskConfig } from "../types/config.js";
import type { ParsedFile } from "../types/parser.js";
import type { RiskFactor, RiskResult } from "../types/risk.js";
import { clamp, logScale, scoreToLevel } from "./levels.js";

/**
 * Deterministic weighted risk heuristic.
 *
 * Each factor normalizes a graph signal into [0, 1] (see the doc comments on
 * `FACTORS`). The score is the weighted sum of the factors scaled to 0-100.
 * Factors and thresholds are user-configurable; the defaults sum to 1.0.
 */

interface RiskInput {
  summary: ImpactSummary;
  targetParsed: ParsedFile;
  targetInCycle: boolean;
  riskConfig: RiskConfig;
}

interface FactorDefinition {
  name: string;
  label: string;
  /** Default weight (config overrides). */
  defaultWeight: number;
  compute: (input: RiskInput) => number;
}

/** Saturation caps: the count at which a factor maxes out. */
const CAP_AFFECTED_FILES = 100;
const CAP_UTILITIES = 10;
const CAP_TESTS = 15;
const CAP_ROUTES = 10;
const CAP_EXPORTS = 20;

const FACTORS: FactorDefinition[] = [
  {
    name: "affectedFiles",
    label: "Affected files",
    defaultWeight: 0.3,
    compute: ({ summary }) => logScale(summary.affectedFiles, CAP_AFFECTED_FILES),
  },
  {
    name: "entryPoint",
    label: "Entry point impacted",
    defaultWeight: 0.15,
    compute: ({ summary }) => (summary.entries > 0 ? 1 : 0),
  },
  {
    name: "sharedUtility",
    label: "Shared utilities impacted",
    defaultWeight: 0.15,
    compute: ({ summary }) => clamp(summary.utilities / CAP_UTILITIES, 0, 1),
  },
  {
    name: "publicExports",
    label: "Public export surface",
    defaultWeight: 0.1,
    compute: ({ targetParsed }) => {
      const { exports } = targetParsed;
      const count =
        exports.named.length + (exports.hasDefault ? 1 : 0) + exports.reExportedFrom.length;
      return clamp(count / CAP_EXPORTS, 0, 1);
    },
  },
  {
    name: "tests",
    label: "Tests affected",
    defaultWeight: 0.1,
    compute: ({ summary }) => clamp(summary.tests / CAP_TESTS, 0, 1),
  },
  {
    name: "routes",
    label: "Routes affected",
    defaultWeight: 0.1,
    compute: ({ summary }) => clamp(summary.routes / CAP_ROUTES, 0, 1),
  },
  {
    name: "cycleMembership",
    label: "Circular dependency",
    defaultWeight: 0.1,
    compute: ({ targetInCycle }) => (targetInCycle ? 1 : 0),
  },
];

function weightFor(definition: FactorDefinition, input: RiskInput): number {
  const configured = input.riskConfig.weights[definition.name as keyof RiskConfig["weights"]];
  return configured ?? definition.defaultWeight;
}

/**
 * Compute the risk score and per-factor breakdown for an analysis result.
 */
export function scoreRisk(input: RiskInput): RiskResult {
  const factors: RiskFactor[] = FACTORS.map((definition) => {
    const weight = weightFor(definition, input);
    const value = definition.compute(input);
    return {
      name: definition.name,
      label: definition.label,
      weight,
      value,
      contribution: Math.round(weight * value * 100 * 100) / 100,
    };
  });

  const score = clamp(
    Math.round(factors.reduce((sum, factor) => sum + factor.contribution, 0) * 100) / 100,
    0,
    100,
  );

  return {
    score,
    level: scoreToLevel(score, input.riskConfig.thresholds),
    factors,
  };
}
