import { describe, expect, it } from "vitest";
import {
  buildAnalyzeSarif,
  buildDiffSarif,
  riskToSarifLevel,
} from "../../../src/formatter/sarif.js";
import type { AnalysisResult } from "../../../src/types/analysis.js";
import type { DependencyGraph } from "../../../src/types/graph.js";
import type { DiffCounts } from "../../../src/commands/diff.js";
import { basicFixture } from "../../helpers/fixtures.js";
import path from "node:path";

function fakeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    targetPath: path.join(basicFixture, "src", "auth", "token.ts"),
    rootDir: basicFixture,
    risk: { level: "HIGH", score: 72.5, factors: [] },
    summary: {
      affectedFiles: 4,
      maxDepth: 2,
      confidence: 1,
      routes: 2,
      components: 1,
      tests: 1,
      utilities: 0,
      entries: 0,
      topImpact: [],
    },
    affected: new Map(),
    targetInCycle: false,
    maxDepth: 2,
    durationMs: 10,
    graph: {
      nodes: new Map(),
      forward: new Map(),
      reverse: new Map(),
      external: new Map(),
      cycles: [],
      stats: {
        files: 1,
        parsed: 1,
        internalEdges: 0,
        unresolvedEdges: 0,
        externalEdges: 0,
        cycles: 0,
      },
    } as DependencyGraph,
    ...overrides,
  };
}

const counts: DiffCounts = { low: 1, medium: 0, high: 1, critical: 0 };

describe("riskToSarifLevel", () => {
  it("maps CRITICAL and HIGH to error, MEDIUM to warning, LOW to note", () => {
    expect(riskToSarifLevel("CRITICAL")).toBe("error");
    expect(riskToSarifLevel("HIGH")).toBe("error");
    expect(riskToSarifLevel("MEDIUM")).toBe("warning");
    expect(riskToSarifLevel("LOW")).toBe("note");
  });
});

describe("buildDiffSarif", () => {
  const doc = buildDiffSarif({
    baseLabel: "origin/main",
    entries: [
      { rel: "src/auth/token.ts", result: fakeResult(), allowed: false },
      {
        rel: "src/legacy/session.ts",
        result: fakeResult({ risk: { level: "LOW", score: 12.4, factors: [] } }),
        allowed: true,
      },
    ],
    gate: "high",
    counts,
    blocked: true,
    durationMs: 118,
    version: "0.7.0",
  });

  it("emits SARIF 2.1.0 with the ripple driver", () => {
    expect(doc.version).toBe("2.1.0");
    expect(doc.$schema).toContain("sarif-2.1.0");
    const driver = doc.runs[0]!.tool.driver as Record<string, unknown>;
    expect(driver.name).toBe("ripple");
    expect(driver.version).toBe("0.7.0");
  });

  it("scores a blocking HIGH result as error with a fingerprint", () => {
    const first = doc.runs[0]!.results[0]! as Record<string, unknown>;
    expect(first.ruleId).toBe("ripple/risk");
    expect(first.level).toBe("error");
    const location = (first.locations as Array<Record<string, unknown>>)![0]!;
    const artifact = location.physicalLocation as Record<string, unknown>;
    expect((artifact.artifactLocation as Record<string, unknown>).uri).toBe("src/auth/token.ts");
    const fp = first.partialFingerprints as Record<string, unknown>;
    expect(fp.primaryLocationLineHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("emits allowlisted files as note with an in-source suppression", () => {
    const second = doc.runs[0]!.results[1]! as Record<string, unknown>;
    expect(second.level).toBe("note");
    expect(second.suppressions).toEqual([expect.objectContaining({ kind: "inSource" })]);
  });

  it("carries the gate verdict and counts in run properties", () => {
    const props = doc.runs[0]!.properties as Record<string, unknown>;
    const ripple = props.ripple as Record<string, unknown>;
    expect(ripple.gate).toBe("high");
    expect(ripple.blocked).toBe(true);
  });
});

describe("buildAnalyzeSarif", () => {
  const result = fakeResult();
  const doc = buildAnalyzeSarif({ result, cwd: basicFixture, version: "0.7.0" });

  it("produces a single result for the target file", () => {
    expect(doc.runs[0]!.results).toHaveLength(1);
    const entry = doc.runs[0]!.results[0]! as Record<string, unknown>;
    expect(entry.level).toBe("error");
    const location = (entry.locations as Array<Record<string, unknown>>)![0]!;
    const artifact = location.physicalLocation as Record<string, unknown>;
    expect((artifact.artifactLocation as Record<string, unknown>).uri).toBe(
      path.join("src", "auth", "token.ts").replace(/\\/g, "/"),
    );
  });

  it("fingerprints are stable for the same file and score", () => {
    const a = buildAnalyzeSarif({ result, cwd: basicFixture, version: "0.7.0" });
    const b = buildAnalyzeSarif({ result, cwd: basicFixture, version: "0.7.0" });
    expect((a.runs[0]!.results[0]! as Record<string, unknown>).partialFingerprints).toEqual(
      (b.runs[0]!.results[0]! as Record<string, unknown>).partialFingerprints,
    );
  });
});
