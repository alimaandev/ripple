import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "../../../src/types/analysis.js";
import type { RiskLevel } from "../../../src/types/risk.js";
import {
  buildFileAnnotations,
  buildGateAnnotation,
  renderAnnotation,
} from "../../../src/formatter/annotations.js";

function resultFor(level: RiskLevel, score: number, affected = 1): AnalysisResult {
  return {
    targetPath: "irrelevant",
    risk: { score, level, factors: [] },
    summary: { affectedFiles: affected },
  } as unknown as AnalysisResult;
}

describe("buildFileAnnotations", () => {
  const files = [
    { file: "src/a.ts", result: resultFor("LOW", 12) },
    { file: "src/b.ts", result: resultFor("MEDIUM", 45) },
    { file: "src/c.ts", result: resultFor("HIGH", 66) },
    { file: "src/d.ts", result: resultFor("CRITICAL", 90) },
  ];

  it("marks gate-level and above as errors", () => {
    const lines = buildFileAnnotations(files, "high");
    expect(lines.map((l) => `${l.level}:${l.file}`)).toEqual([
      "warning:src/a.ts",
      "warning:src/b.ts",
      "error:src/c.ts",
      "error:src/d.ts",
    ]);
  });

  it("warns on everything below the blocking level at a critical gate", () => {
    const lines = buildFileAnnotations(files, "critical");
    expect(lines.map((l) => `${l.level}:${l.file}`)).toEqual([
      "warning:src/a.ts",
      "warning:src/b.ts",
      "warning:src/c.ts",
      "error:src/d.ts",
    ]);
  });

  it("pluralizes the affected-file count", () => {
    const lines = buildFileAnnotations(
      [
        { file: "a.ts", result: resultFor("MEDIUM", 40, 1) },
        { file: "b.ts", result: resultFor("MEDIUM", 40, 3) },
      ],
      "critical",
    );
    expect(lines[0]!.message).toContain("1 affected file");
    expect(lines[1]!.message).toContain("3 affected files");
  });
});

describe("renderAnnotation", () => {
  it("renders a file annotation with escaped properties and message", () => {
    const line = renderAnnotation({
      level: "error",
      file: "src/odd, name.ts",
      title: "Ripple HIGH:1",
      message: "HIGH risk (score 62) — 2 affected files\nsee log",
    });
    expect(line).toBe(
      "::error file=src/odd%2C name.ts,title=Ripple HIGH%3A1::HIGH risk (score 62) — 2 affected files%0Asee log",
    );
  });

  it("renders a notice without a file property", () => {
    expect(
      renderAnnotation({ level: "notice", title: "Ripple diff high gate", message: "Gate passed" }),
    ).toBe("::notice title=Ripple diff high gate::Gate passed");
  });
});

describe("buildGateAnnotation", () => {
  it("reports a blocked gate with the risky summary", () => {
    const line = buildGateAnnotation(true, "high", { low: 0, medium: 1, high: 2, critical: 0 });
    expect(line).toMatchObject({
      level: "notice",
      message: "Gate blocked: 2 HIGH at or above high",
    });
  });

  it("reports a clean gate", () => {
    const line = buildGateAnnotation(false, "critical", {
      low: 1,
      medium: 0,
      high: 0,
      critical: 0,
    });
    expect(line.message).toBe("Gate passed: nothing at critical or above");
  });
});
