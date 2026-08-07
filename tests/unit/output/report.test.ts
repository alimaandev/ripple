import path from "node:path";
import { describe, expect, it } from "vitest";
import { basicFixture } from "../../helpers/fixtures.js";
import { createTsProject } from "../../../src/parser/ts-project.js";
import { buildGraph, findNode } from "../../../src/graph/build.js";
import { detectEntryPoints } from "../../../src/analyzer/categorize.js";
import { analyzeFile } from "../../../src/analyzer/analyze.js";
import {
  buildAnalyzeJsonReport,
  buildGraphJsonReport,
  renderAnalyzeReport,
  renderGraphReport,
  type GraphReportInput,
} from "../../../src/output/report.js";
import { InMemoryWriter } from "../../../src/output/writer.js";
import { pathKey } from "../../../src/utils/paths.js";
import { loadProjectContext } from "../../../src/config/loader.js";
import type { AnalysisResult } from "../../../src/types/analysis.js";

const rootDir = basicFixture;

async function analyzeLogin(): Promise<AnalysisResult> {
  const project = createTsProject();
  const context = await loadProjectContext(rootDir);
  const filePaths = [
    "src/index.ts",
    "src/main.ts",
    "src/authentication/login.ts",
    "src/authentication/oauth.ts",
    "src/session/manager.ts",
    "src/oauth/provider.ts",
    "src/shared/constants.ts",
    "src/shared/types.ts",
    "src/utils/format.ts",
    "src/components/Button.tsx",
    "src/components/Icon.tsx",
    "src/components/index.ts",
    "src/dashboard/page.tsx",
    "src/dashboard/route.ts",
    "src/api/users/route.ts",
    "src/app/page.tsx",
    "src/mobile/route.ts",
    "src/admin/page.tsx",
    "src/circular/a.ts",
    "src/circular/b.ts",
    "src/circular/c.ts",
    "src/tests/login.test.ts",
    "src/tests/session.spec.ts",
    "src/legacy.ts",
    "src/legacy/helper.js",
  ].map((p) => path.join(rootDir, p));
  const graph = buildGraph(project, filePaths, {
    rootDir,
    aliases: context.aliases,
    fileKeys: new Set(filePaths.map((p) => pathKey(p, rootDir))),
  });
  const entryPoints = await detectEntryPoints(rootDir);
  const loginPath = path.join(rootDir, "src", "authentication", "login.ts");
  const found = findNode(graph, loginPath, rootDir);
  return analyzeFile({
    graph,
    context,
    entryPoints,
    targetKey: found!.key,
    targetPath: loginPath,
    durationMs: 42,
  });
}

describe("renderAnalyzeReport", () => {
  it("renders the full terminal report", async () => {
    const result = await analyzeLogin();
    const writer = new InMemoryWriter();
    renderAnalyzeReport(result, { cwd: rootDir, color: false, verbose: false }, writer);

    const output = writer.output;
    expect(output).toContain("Ripple Analysis");
    expect(output).toContain("Risk            MEDIUM");
    expect(output).toContain("Affected Files  7 files");
    expect(output).toContain("API Routes      4");
    expect(output).toContain("Tests           1");
    expect(output).toContain("Confidence");
    expect(output).toContain("Top Impact");
    expect(output).toContain("• Dashboard (2)");
    expect(output).toContain("src/tests/login.test.ts (depth 1)");
    expect(output).toContain("src/main.ts (depth 2)");
    expect(output).toContain("⭕");
  });

  it("includes the risk factor table in verbose mode", async () => {
    const result = await analyzeLogin();
    const writer = new InMemoryWriter();
    renderAnalyzeReport(result, { cwd: rootDir, color: false, verbose: true }, writer);

    expect(writer.output).toContain("Risk Factors");
    expect(writer.output).toContain("Affected files");
    expect(writer.output).toContain("Weight");
    expect(writer.output).toContain("Points");
  });

  it("annotates cycle members", async () => {
    const project = createTsProject();
    const context = await loadProjectContext(rootDir);
    const filePaths = [
      "src/index.ts",
      "src/main.ts",
      "src/authentication/login.ts",
      "src/authentication/oauth.ts",
      "src/session/manager.ts",
      "src/oauth/provider.ts",
      "src/shared/constants.ts",
      "src/shared/types.ts",
      "src/utils/format.ts",
      "src/components/Button.tsx",
      "src/components/Icon.tsx",
      "src/components/index.ts",
      "src/dashboard/page.tsx",
      "src/dashboard/route.ts",
      "src/api/users/route.ts",
      "src/app/page.tsx",
      "src/mobile/route.ts",
      "src/admin/page.tsx",
      "src/circular/a.ts",
      "src/circular/b.ts",
      "src/circular/c.ts",
      "src/tests/login.test.ts",
      "src/tests/session.spec.ts",
      "src/legacy.ts",
      "src/legacy/helper.js",
    ].map((p) => path.join(rootDir, p));
    const graph = buildGraph(project, filePaths, {
      rootDir,
      aliases: context.aliases,
      fileKeys: new Set(filePaths.map((p) => pathKey(p, rootDir))),
    });
    const entryPoints = await detectEntryPoints(rootDir);
    const cPath = path.join(rootDir, "src", "circular", "c.ts");
    const found = findNode(graph, cPath, rootDir);
    const result = analyzeFile({
      graph,
      context,
      entryPoints,
      targetKey: found!.key,
      targetPath: cPath,
      durationMs: 0,
    });

    const writer = new InMemoryWriter();
    renderAnalyzeReport(result, { cwd: rootDir, color: false, verbose: false }, writer);
    expect(writer.output).toContain("(cycle)");
  });
});

describe("buildAnalyzeJsonReport", () => {
  it("emits the stable JSON contract", async () => {
    const result = await analyzeLogin();
    const report = buildAnalyzeJsonReport(result, "0.0.0-test", rootDir);

    expect(report.tool).toBe("ripple");
    expect(report.version).toBe("0.0.0-test");
    expect(report.command).toBe("analyze");
    expect(report.file).toBe("src/authentication/login.ts");
    expect(report.risk.level).toBe("MEDIUM");
    expect(report.summary.affectedFiles).toBe(7);
    expect(report.targetInCycle).toBe(false);
    expect(report.durationMs).toBe(42);
    expect(report.affected).toHaveLength(7);
    expect(report.affected[0]).toMatchObject({ depth: 1 });
    expect(report.cycles).toHaveLength(1);
    expect(report.cycles[0]!.members).toContain("src/circular/a.ts");
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});

function graphInput(): GraphReportInput {
  const cycleKeys = [
    path.join(rootDir, "src", "circular", "a.ts"),
    path.join(rootDir, "src", "circular", "b.ts"),
    path.join(rootDir, "src", "circular", "c.ts"),
  ];
  return {
    stats: {
      files: 25,
      parsed: 24,
      internalEdges: 30,
      unresolvedEdges: 0,
      externalEdges: 2,
      cycles: 1,
    },
    cycles: [{ members: cycleKeys, path: [...cycleKeys, cycleKeys[0]!] }],
    nodes: new Map(),
    cwd: rootDir,
  };
}

describe("renderGraphReport", () => {
  it("renders stats and cycle chains", () => {
    const writer = new InMemoryWriter();
    renderGraphReport(graphInput(), { cwd: rootDir, color: false, verbose: false }, writer);

    const output = writer.output;
    expect(output).toContain("Files            25");
    expect(output).toContain("Edges            30");
    expect(output).toContain("Circular groups  1");
    expect(output).toContain("⭕ src/circular/a.ts → src/circular/b.ts → src/circular/c.ts");
  });

  it("renders forward and reverse lists when provided", () => {
    const input = graphInput();
    input.forward = ["src/main.ts"];
    input.reverse = ["src/index.ts", "src/legacy.ts"];
    const writer = new InMemoryWriter();
    renderGraphReport(input, { cwd: rootDir, color: false, verbose: false }, writer);

    expect(writer.output).toContain("Dependants (forward)");
    expect(writer.output).toContain("src/main.ts");
    expect(writer.output).toContain("Dependents (reverse)");
    expect(writer.output).toContain("src/legacy.ts");
  });

  it("reports no cycles plainly", () => {
    const input = graphInput();
    input.stats.cycles = 0;
    input.cycles = [];
    const writer = new InMemoryWriter();
    renderGraphReport(input, { cwd: rootDir, color: false, verbose: false }, writer);
    expect(writer.output).toContain("No circular dependencies found.");
  });
});

describe("buildGraphJsonReport", () => {
  it("emits the stable JSON contract", () => {
    const input = graphInput();
    input.forward = ["src/main.ts"];
    const report = buildGraphJsonReport(input, "0.0.0-test");

    expect(report.command).toBe("graph");
    expect(report.fileCount).toBe(25);
    expect(report.edgeCount).toBe(30);
    expect(report.externalEdgeCount).toBe(2);
    expect(report.cycles[0]!.members).toContain("src/circular/a.ts");
    expect(report.forward).toEqual(["src/main.ts"]);
    expect(report.reverse).toBeUndefined();
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
