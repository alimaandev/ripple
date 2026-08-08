import { describe, expect, it } from "vitest";
import { buildDiffJsonReport, countLevels, riskySummary } from "../../../src/commands/diff.js";
import type { AnalysisResult } from "../../../src/types/analysis.js";
import type { RiskLevel } from "../../../src/types/risk.js";

/** Minimal fake result carrying only the fields the helpers read. */
function resultFor(level: RiskLevel, score: number, path: string): AnalysisResult {
  return {
    targetPath: `/repo/${path}`,
    risk: { score, level, factors: [] },
    summary: { affectedFiles: 1 },
  } as unknown as AnalysisResult;
}

describe("countLevels", () => {
  it("tallies risk levels across results", () => {
    const counts = countLevels([
      resultFor("LOW", 5, "a.ts"),
      resultFor("MEDIUM", 40, "b.ts"),
      resultFor("HIGH", 60, "c.ts"),
      resultFor("CRITICAL", 90, "d.ts"),
    ]);
    expect(counts).toEqual({ low: 1, medium: 1, high: 1, critical: 1 });
  });

  it("returns zeros for an empty set", () => {
    expect(countLevels([])).toEqual({ low: 0, medium: 0, high: 0, critical: 0 });
  });
});

describe("riskySummary", () => {
  const counts = { low: 2, medium: 1, high: 3, critical: 1 };

  it("summarizes levels at or above the gate", () => {
    expect(riskySummary(counts, "critical")).toBe("1 CRITICAL");
    expect(riskySummary(counts, "high")).toBe("1 CRITICAL · 3 HIGH");
    expect(riskySummary(counts, "medium")).toBe("1 CRITICAL · 3 HIGH · 1 MEDIUM");
  });

  it("reports none when nothing reaches the gate", () => {
    expect(riskySummary({ low: 2, medium: 1, high: 0, critical: 0 }, "high")).toBe("none");
  });
});

describe("buildDiffJsonReport", () => {
  it("emits the stable diff contract with risky files first", () => {
    const byRel = new Map<string, AnalysisResult>([
      ["src/a.ts", resultFor("LOW", 10, "src/a.ts")],
      ["src/b.ts", resultFor("CRITICAL", 95, "src/b.ts")],
    ]);
    const report = buildDiffJsonReport(
      "origin/main",
      ["src/a.ts", "src/b.ts", "README.md"],
      byRel,
      "high",
      true,
      { low: 1, medium: 0, high: 0, critical: 1 },
      42,
      "0.0.0-test",
    );

    expect(report.tool).toBe("ripple");
    expect(report.command).toBe("diff");
    expect(report.base).toBe("origin/main");
    expect(report.changedFiles).toBe(3);
    expect(report.gate).toEqual({
      level: "high",
      blocked: true,
      counts: { low: 1, medium: 0, high: 0, critical: 1 },
    });
    expect(report.files).toHaveLength(3);
    expect(report.files[0]).toMatchObject({ file: "src/b.ts", analyzed: true, affectedFiles: 1 });
    expect(report.files[2]).toMatchObject({ file: "README.md", analyzed: false });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
