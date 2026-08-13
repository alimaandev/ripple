import { describe, expect, it } from "vitest";
import {
  buildDiffJsonReport,
  countLevels,
  isAllowedByDiffAllowlist,
  renderDiffReport,
  riskySummary,
} from "../../../src/commands/diff.js";
import type { AnalysisResult } from "../../../src/types/analysis.js";
import type { OutputWriter } from "../../../src/types/cli.js";
import type { RiskLevel } from "../../../src/types/risk.js";

/** Minimal fake result carrying only the fields the helpers read. */
function resultFor(level: RiskLevel, score: number, path: string): AnalysisResult {
  return {
    targetPath: `/repo/${path}`,
    risk: { score, level, factors: [] },
    summary: { affectedFiles: 1 },
  } as unknown as AnalysisResult;
}

function memoryWriter(): OutputWriter & { text: string } {
  let text = "";
  const writer = {
    get text() {
      return text;
    },
    write: (chunk: string) => {
      text += chunk;
    },
    writeLine: (line: string = "") => {
      text += `${line}\n`;
    },
  };
  return writer;
}

function renderInput(overrides: Partial<Parameters<typeof renderDiffReport>[0]> = {}) {
  const entries = [
    { rel: "src/a.ts", result: resultFor("LOW", 10, "src/a.ts"), allowed: false },
    {
      rel: "src/legacy/old.ts",
      result: resultFor("CRITICAL", 95, "src/legacy/old.ts"),
      allowed: true,
    },
  ];
  return {
    cwd: "/repo",
    baseLabel: "origin/main",
    files: ["src/a.ts", "src/legacy/old.ts"],
    entries,
    skipped: ["README.md"],
    counts: { low: 1, medium: 0, high: 0, critical: 0 },
    allowedCount: 1,
    gate: "high" as const,
    blocked: false,
    durationMs: 12,
    style: { color: false },
    ...overrides,
  };
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
      new Map([
        ["src/a.ts", false],
        ["src/b.ts", false],
      ]),
      "high",
      true,
      { low: 1, medium: 0, high: 0, critical: 1 },
      0,
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
      allowed: 0,
    });
    expect(report.files).toHaveLength(3);
    expect(report.files[0]).toMatchObject({ file: "src/b.ts", analyzed: true, affectedFiles: 1 });
    expect(report.files[2]).toMatchObject({ file: "README.md", analyzed: false });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("flags files that match the allowlist", () => {
    const byRel = new Map<string, AnalysisResult>([
      ["src/legacy/old.ts", resultFor("CRITICAL", 95, "src/legacy/old.ts")],
    ]);
    const report = buildDiffJsonReport(
      "HEAD",
      ["src/legacy/old.ts"],
      byRel,
      new Map([["src/legacy/old.ts", true]]),
      "high",
      false,
      { low: 0, medium: 0, high: 0, critical: 0 },
      1,
      7,
      "0.0.0-test",
    );
    expect(report.files[0]).toMatchObject({ file: "src/legacy/old.ts", allowed: true });
    expect(report.gate.allowed).toBe(1);
    expect(report.gate.blocked).toBe(false);
  });
});

describe("isAllowedByDiffAllowlist", () => {
  it("returns false when there are no patterns", () => {
    expect(isAllowedByDiffAllowlist("src/a.ts", [])).toBe(false);
  });

  it("matches an exact path", () => {
    expect(isAllowedByDiffAllowlist("src/a.ts", ["src/a.ts"])).toBe(true);
    expect(isAllowedByDiffAllowlist("src/b.ts", ["src/a.ts"])).toBe(false);
  });

  it("matches glob patterns and directories", () => {
    expect(isAllowedByDiffAllowlist("src/legacy/a.ts", ["src/legacy/**"])).toBe(true);
    expect(isAllowedByDiffAllowlist("src/legacy/nested/b.ts", ["src/legacy/**"])).toBe(true);
    expect(isAllowedByDiffAllowlist("src/modern/c.ts", ["src/legacy/**"])).toBe(false);
  });

  it("matches a single wildcard at any depth", () => {
    expect(isAllowedByDiffAllowlist("src/legacy/a.ts", ["**/legacy/**"])).toBe(true);
    expect(isAllowedByDiffAllowlist("src/mock/a.mock.ts", ["**/*.mock.ts"])).toBe(true);
  });

  it("normalizes backslash paths for matching", () => {
    expect(isAllowedByDiffAllowlist("src\\legacy\\a.ts", ["src/legacy/**"])).toBe(true);
  });
});

describe("renderDiffReport", () => {
  it("renders the gate verdict and per-file rows", () => {
    const writer = memoryWriter();
    renderDiffReport(renderInput(), writer);
    expect(writer.text).toContain("diff vs origin/main");
    expect(writer.text).toContain("Gate passed");
    expect(writer.text).toContain("Risk analysis (2 files)");
    expect(writer.text).toContain("src/a.ts");
  });

  it("marks allowlisted files and shows the allowed count", () => {
    const writer = memoryWriter();
    renderDiffReport(renderInput(), writer);
    expect(writer.text).toContain("Allowed");
    expect(writer.text).toContain("src/legacy/old.ts  CRITICAL · 95.0/100 (allowed)");
  });

  it("shows a blocked verdict with gate-level counts", () => {
    const writer = memoryWriter();
    renderDiffReport(
      renderInput({
        blocked: true,
        counts: { low: 0, medium: 0, high: 1, critical: 1 },
        entries: [
          { rel: "src/a.ts", result: resultFor("HIGH", 60, "src/a.ts"), allowed: false },
          { rel: "src/b.ts", result: resultFor("CRITICAL", 95, "src/b.ts"), allowed: false },
        ],
      }),
      writer,
    );
    expect(writer.text).toContain("Gate blocked");
    expect(writer.text).toContain("1 CRITICAL · 1 HIGH");
  });

  it("lists files that were skipped as non-source", () => {
    const writer = memoryWriter();
    renderDiffReport(renderInput(), writer);
    expect(writer.text).toContain("README.md (not a source file)");
  });
});
