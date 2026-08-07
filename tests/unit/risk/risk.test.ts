import { describe, expect, it } from "vitest";
import { clamp, logScale, scoreToLevel } from "../../../src/risk/levels.js";
import { scoreRisk } from "../../../src/risk/score.js";
import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import type { ImpactSummary } from "../../../src/types/analysis.js";
import type { ParsedFile } from "../../../src/types/parser.js";

const riskConfig = DEFAULT_CONFIG.risk;

function summary(overrides: Partial<ImpactSummary>): ImpactSummary {
  return {
    affectedFiles: 0,
    routes: 0,
    tests: 0,
    components: 0,
    utilities: 0,
    entries: 0,
    maxDepth: 0,
    topImpact: [],
    confidence: 100,
    ...overrides,
  };
}

function parsedFile(exports: Partial<ParsedFile["exports"]> = {}): ParsedFile {
  return {
    path: "src/target.ts",
    kind: "ts",
    imports: [],
    exports: { named: [], hasDefault: false, reExportedFrom: [], reExportedAll: [], ...exports },
    symbols: { functions: [], classes: [], interfaces: [], enums: [], typeAliases: [] },
  };
}

describe("scoreToLevel", () => {
  it("maps scores to levels at the configured boundaries", () => {
    expect(scoreToLevel(0, riskConfig.thresholds)).toBe("LOW");
    expect(scoreToLevel(29, riskConfig.thresholds)).toBe("LOW");
    expect(scoreToLevel(30, riskConfig.thresholds)).toBe("MEDIUM");
    expect(scoreToLevel(54, riskConfig.thresholds)).toBe("MEDIUM");
    expect(scoreToLevel(55, riskConfig.thresholds)).toBe("HIGH");
    expect(scoreToLevel(79, riskConfig.thresholds)).toBe("HIGH");
    expect(scoreToLevel(80, riskConfig.thresholds)).toBe("CRITICAL");
    expect(scoreToLevel(100, riskConfig.thresholds)).toBe("CRITICAL");
  });
});

describe("logScale", () => {
  it("scales counts logarithmically", () => {
    expect(logScale(0, 100)).toBe(0);
    expect(logScale(100, 100)).toBe(1);
    expect(logScale(500, 100)).toBe(1);
    expect(logScale(9, 100)).toBeGreaterThan(0);
    expect(logScale(9, 100)).toBeLessThan(1);
    expect(logScale(1, 100)).toBeGreaterThan(0);
  });

  it("clamps values", () => {
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
  });
});

describe("scoreRisk", () => {
  it("scores an isolated file as LOW", () => {
    const result = scoreRisk({
      summary: summary({}),
      targetParsed: parsedFile(),
      targetInCycle: false,
      riskConfig,
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe("LOW");
    expect(result.factors).toHaveLength(7);
  });

  it("reaches HIGH with a large blast radius", () => {
    const result = scoreRisk({
      summary: summary({ affectedFiles: 38, routes: 8, tests: 16, entries: 1, utilities: 6 }),
      targetParsed: parsedFile({
        named: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
        hasDefault: true,
      }),
      targetInCycle: false,
      riskConfig,
    });
    expect(result.level).toBe("HIGH");
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.score).toBeLessThan(80);
  });

  it("is CRITICAL when the target is in a cycle and the surface is big", () => {
    const result = scoreRisk({
      summary: summary({ affectedFiles: 200, tests: 30, routes: 20, entries: 2, utilities: 12 }),
      targetParsed: parsedFile({ named: ["a", "b", "c"], hasDefault: true }),
      targetInCycle: true,
      riskConfig,
    });
    expect(result.level).toBe("CRITICAL");
  });

  it("respects custom thresholds", () => {
    const custom = {
      ...riskConfig,
      thresholds: { medium: 10, high: 20, critical: 40 },
    };
    const result = scoreRisk({
      summary: summary({ affectedFiles: 10, entries: 1 }),
      targetParsed: parsedFile(),
      targetInCycle: false,
      riskConfig: custom,
    });
    expect(result.level).toBe("HIGH");
  });

  it("respects custom weights", () => {
    const custom = {
      ...riskConfig,
      weights: { ...riskConfig.weights, entryPoint: 0.5, affectedFiles: 0.1 },
    };
    const noEntry = scoreRisk({
      summary: summary({ affectedFiles: 100 }),
      targetParsed: parsedFile(),
      targetInCycle: false,
      riskConfig: custom,
    });
    const withEntry = scoreRisk({
      summary: summary({ affectedFiles: 0, entries: 1 }),
      targetParsed: parsedFile(),
      targetInCycle: false,
      riskConfig: custom,
    });
    expect(noEntry.score).toBe(10);
    expect(noEntry.level).toBe("LOW");
    expect(withEntry.score).toBe(50);
    expect(withEntry.level).toBe("MEDIUM");
  });

  it("breaks down factor contributions", () => {
    const result = scoreRisk({
      summary: summary({ affectedFiles: 100, entries: 1 }),
      targetParsed: parsedFile(),
      targetInCycle: false,
      riskConfig,
    });
    const entryFactor = result.factors.find((f) => f.name === "entryPoint");
    expect(entryFactor?.contribution).toBe(15);
    const affectedFactor = result.factors.find((f) => f.name === "affectedFiles");
    expect(affectedFactor?.contribution).toBe(30);
    expect(result.factors.reduce((sum, factor) => sum + factor.contribution, 0)).toBe(result.score);
  });
});
