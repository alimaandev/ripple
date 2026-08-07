import path from "node:path";
import { describe, expect, it } from "vitest";
import { basicFixture } from "../../helpers/fixtures.js";
import { createTsProject } from "../../../src/parser/ts-project.js";
import { buildGraph, findNode } from "../../../src/graph/build.js";
import { reverseTraverse } from "../../../src/analyzer/reverse-traverse.js";
import { createCategorizer, detectEntryPoints } from "../../../src/analyzer/categorize.js";
import { computeConfidence } from "../../../src/analyzer/confidence.js";
import { analyzeFile } from "../../../src/analyzer/analyze.js";
import { humanizeArea } from "../../../src/analyzer/humanize.js";
import { pathKey } from "../../../src/utils/paths.js";
import { loadProjectContext } from "../../../src/config/loader.js";
import type { GraphStats } from "../../../src/types/graph.js";

const rootDir = basicFixture;

async function buildFixtureGraph(): Promise<{
  graph: ReturnType<typeof buildGraph>;
  context: Awaited<ReturnType<typeof loadProjectContext>>;
  entryPoints: Set<string>;
}> {
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
  return { graph, context, entryPoints };
}

describe("reverseTraverse", () => {
  it("finds direct and indirect dependents with depths", async () => {
    const { graph } = await buildFixtureGraph();
    const loginPath = path.join(rootDir, "src", "authentication", "login.ts");
    const loginKey = pathKey(loginPath, rootDir);
    const { affected, maxDepth } = reverseTraverse(graph, loginKey, {
      categorize: () => ["other"],
    });

    expect(maxDepth).toBe(2);

    const direct = [...affected.values()]
      .filter((f) => f.depth === 1)
      .map((f) => path.basename(f.path));
    expect(direct).toEqual(
      expect.arrayContaining([
        "index.ts",
        "page.tsx",
        "route.ts",
        "login.test.ts",
        "route.ts",
        "page.tsx",
      ]),
    );
    expect([...affected.values()].find((f) => f.path.endsWith("main.ts"))?.depth).toBe(2);
  });

  it("caps depth when maxDepth is set", async () => {
    const { graph } = await buildFixtureGraph();
    const loginKey = pathKey(path.join(rootDir, "src", "authentication", "login.ts"), rootDir);
    const { affected, maxDepth } = reverseTraverse(graph, loginKey, {
      maxDepth: 1,
      categorize: () => ["other"],
    });
    expect(maxDepth).toBe(1);
    expect([...affected.values()].some((f) => f.depth > 1)).toBe(false);
  });

  it("flags cycle members", async () => {
    const { graph } = await buildFixtureGraph();
    const bKey = pathKey(path.join(rootDir, "src", "circular", "b.ts"), rootDir);
    const cKey = pathKey(path.join(rootDir, "src", "circular", "c.ts"), rootDir);
    const { affected } = reverseTraverse(graph, bKey, { categorize: () => ["other"] });
    expect(affected.get(cKey)?.inCycle).toBe(true);
  });

  it("returns empty for files nobody imports", async () => {
    const { graph } = await buildFixtureGraph();
    const key = pathKey(path.join(rootDir, "src", "main.ts"), rootDir);
    const { affected } = reverseTraverse(graph, key, { categorize: () => ["other"] });
    expect(affected.size).toBe(0);
  });
});

describe("categorize", () => {
  it("classifies fixture files deterministically", async () => {
    const entryPoints = await detectEntryPoints(rootDir);
    const categorize = createCategorizer({ rootDir, entryPoints });

    expect(categorize(path.join(rootDir, "src", "dashboard", "route.ts"))).toContain("route");
    expect(categorize(path.join(rootDir, "src", "api", "users", "route.ts"))).toContain("route");
    expect(categorize(path.join(rootDir, "src", "tests", "login.test.ts"))).toContain("test");
    expect(categorize(path.join(rootDir, "src", "components", "Button.tsx"))).toContain(
      "component",
    );
    expect(categorize(path.join(rootDir, "src", "utils", "format.ts"))).toContain("utility");
    expect(categorize(path.join(rootDir, "src", "index.ts"))).toContain("entry");
    expect(categorize(path.join(rootDir, "src", "main.ts"))).toContain("entry");
    expect(categorize(path.join(rootDir, "src", "oauth", "provider.ts"))).toEqual(["other"]);
  });

  it("detects package.json main as entry point", async () => {
    const entryPoints = await detectEntryPoints(rootDir);
    expect(entryPoints.has(path.normalize(path.join(rootDir, "src", "index.ts")))).toBe(true);
  });
});

describe("confidence", () => {
  it("is 100 when everything resolves cleanly", () => {
    const stats: GraphStats = {
      files: 10,
      parsed: 10,
      internalEdges: 20,
      unresolvedEdges: 0,
      externalEdges: 5,
      cycles: 0,
    };
    expect(computeConfidence(stats, false)).toBe(100);
  });

  it("drops with unresolved edges", () => {
    const stats: GraphStats = {
      files: 10,
      parsed: 10,
      internalEdges: 18,
      unresolvedEdges: 2,
      externalEdges: 5,
      cycles: 0,
    };
    expect(computeConfidence(stats, false)).toBeLessThan(100);
    expect(computeConfidence(stats, false)).toBeGreaterThan(90);
  });

  it("penalizes cycle membership of the target", () => {
    const stats: GraphStats = {
      files: 10,
      parsed: 10,
      internalEdges: 20,
      unresolvedEdges: 0,
      externalEdges: 5,
      cycles: 1,
    };
    expect(computeConfidence(stats, true)).toBe(95);
  });
});

describe("humanizeArea", () => {
  it("humanizes directory segments", () => {
    expect(humanizeArea("authentication")).toBe("Authentication");
    expect(humanizeArea("oauth")).toBe("OAuth");
    expect(humanizeArea("user-profile")).toBe("User Profile");
    expect(humanizeArea("api")).toBe("API");
    expect(humanizeArea("dashboard")).toBe("Dashboard");
  });
});

describe("analyzeFile", () => {
  it("produces a complete analysis for login.ts", async () => {
    const { graph, context, entryPoints } = await buildFixtureGraph();
    const loginPath = path.join(rootDir, "src", "authentication", "login.ts");
    const found = findNode(graph, loginPath, rootDir);
    expect(found).toBeDefined();

    const result = analyzeFile({
      graph,
      context,
      entryPoints,
      targetKey: found!.key,
      targetPath: loginPath,
      durationMs: 42,
    });

    expect(result.summary.affectedFiles).toBe(7);
    expect(result.summary.routes).toBe(4);
    expect(result.summary.components).toBe(2);
    expect(result.summary.tests).toBe(1);
    expect(result.summary.entries).toBe(2);
    expect(result.summary.maxDepth).toBe(2);
    expect(result.summary.topImpact[0]!.label).toBe("Dashboard");
    expect(result.summary.confidence).toBeGreaterThan(90);
    expect(result.risk.level).toBe("MEDIUM");
    expect(result.risk.score).toBeGreaterThanOrEqual(30);
    expect(result.risk.score).toBeLessThan(55);
    expect(result.durationMs).toBe(42);
    expect(result.targetInCycle).toBe(false);
  });

  it("flags targets inside cycles", async () => {
    const { graph, context, entryPoints } = await buildFixtureGraph();
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
    expect(result.targetInCycle).toBe(true);
  });
});
