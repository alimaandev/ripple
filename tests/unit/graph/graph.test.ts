import path from "node:path";
import { describe, expect, it } from "vitest";
import { basicFixture } from "../../helpers/fixtures.js";
import { createTsProject } from "../../../src/parser/ts-project.js";
import { buildGraph, findNode } from "../../../src/graph/build.js";
import { resolveEdge, type ResolverContext } from "../../../src/graph/resolve.js";
import { pathKey } from "../../../src/utils/paths.js";
import type { AliasMap } from "../../../src/types/config.js";

const project = createTsProject();
const rootDir = basicFixture;

function filePaths(dir: string, names: string[]): string[] {
  return names.map((name) => path.join(dir, name));
}

function resolver(fileKeys: string[], aliases: AliasMap = {}): ResolverContext {
  return { rootDir, aliases, fileKeys: new Set(fileKeys.map((p) => pathKey(p, rootDir))) };
}

describe("resolveEdge", () => {
  const loginPath = path.join(rootDir, "src", "authentication", "login.ts");
  const keys = filePaths(rootDir, [
    "src/authentication/login.ts",
    "src/session/manager.ts",
    "src/components/Button.tsx",
    "src/components/index.ts",
    "src/shared/constants.ts",
  ]);
  const ctx = resolver(keys, { "@/*": path.join(rootDir, "src", "*") });

  it("resolves relative imports with extension inference", () => {
    const edge = resolveEdge("../session/manager", loginPath, ctx);
    expect(edge).toEqual({
      kind: "internal",
      filePath: path.join(rootDir, "src", "session", "manager.ts"),
    });
  });

  it("resolves directory imports to index files", () => {
    const edge = resolveEdge("./components", path.join(rootDir, "src", "index.ts"), ctx);
    expect(edge.kind).toBe("internal");
    expect(edge.filePath).toBe(path.join(rootDir, "src", "components", "index.ts"));
  });

  it("resolves alias imports", () => {
    const edge = resolveEdge("@/session/manager", path.join(rootDir, "src", "index.ts"), ctx);
    expect(edge.kind).toBe("internal");
    expect(edge.filePath).toBe(path.join(rootDir, "src", "session", "manager.ts"));
  });

  it("classifies bare package imports as external", () => {
    const edge = resolveEdge("react", path.join(rootDir, "src", "components", "Button.tsx"), ctx);
    expect(edge).toEqual({ kind: "external" });
  });

  it("classifies relative imports to existing non-source files as external", () => {
    const edge = resolveEdge("./styles.css", loginPath, ctx);
    expect(edge).toEqual({ kind: "external" });
  });

  it("classifies broken relative imports as unresolved", () => {
    const edge = resolveEdge("./nope", loginPath, ctx);
    expect(edge).toEqual({ kind: "unresolved" });
  });

  it("classifies unknown bare imports as external", () => {
    const edge = resolveEdge("some-package", loginPath, ctx);
    expect(edge).toEqual({ kind: "external" });
  });
});

describe("buildGraph", () => {
  const allFiles = [
    "src/index.ts",
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
    "src/circular/a.ts",
    "src/circular/b.ts",
    "src/circular/c.ts",
    "src/tests/login.test.ts",
    "src/tests/session.spec.ts",
    "src/legacy.ts",
    "src/legacy/helper.js",
  ];
  const keys = filePaths(rootDir, allFiles);
  const ctx = resolver(keys, { "@/*": path.join(rootDir, "src", "*") });

  it("creates one node per file", () => {
    const graph = buildGraph(project, keys, ctx);
    expect(graph.nodes.size).toBe(allFiles.length);
  });

  it("links forward and reverse edges", () => {
    const graph = buildGraph(project, keys, ctx);
    const loginKey = pathKey(path.join(rootDir, "src", "authentication", "login.ts"), rootDir);
    const sessionKey = pathKey(path.join(rootDir, "src", "session", "manager.ts"), rootDir);

    expect(graph.forward.get(loginKey)?.has(sessionKey)).toBe(true);

    const dashboardPageKey = pathKey(path.join(rootDir, "src", "dashboard", "page.tsx"), rootDir);
    expect(graph.reverse.get(loginKey)?.has(dashboardPageKey)).toBe(true);
  });

  it("resolves index and alias edges", () => {
    const graph = buildGraph(project, keys, ctx);
    const indexKey = pathKey(path.join(rootDir, "src", "index.ts"), rootDir);
    const componentsIndexKey = pathKey(
      path.join(rootDir, "src", "components", "index.ts"),
      rootDir,
    );
    expect(graph.forward.get(indexKey)?.has(componentsIndexKey)).toBe(true);

    const buttonKey = pathKey(path.join(rootDir, "src", "components", "Button.tsx"), rootDir);
    expect(graph.forward.get(componentsIndexKey)?.has(buttonKey)).toBe(true);
  });

  it("records external edges", () => {
    const graph = buildGraph(project, keys, ctx);
    const buttonKey = pathKey(path.join(rootDir, "src", "components", "Button.tsx"), rootDir);
    expect(graph.external.get(buttonKey)?.has("react")).toBe(true);
  });

  it("detects the circular dependency", () => {
    const graph = buildGraph(project, keys, ctx);
    const cycle = graph.cycles.find((c) => c.members.some((m) => m.includes("circular")));
    expect(cycle).toBeDefined();
    expect(cycle!.members.length).toBe(3);
    for (const member of cycle!.members) {
      expect(member).toMatch(/circular[\\/](a|b|c)\.ts/);
    }
    expect(cycle!.path[0]).toBe(cycle!.path[cycle!.path.length - 1]);
    expect(cycle!.path.length).toBeGreaterThan(1);
  });

  it("is idempotent across rebuilds", () => {
    const graphA = buildGraph(project, keys, ctx);
    const graphB = buildGraph(project, keys, ctx);
    expect(graphA.nodes.size).toBe(graphB.nodes.size);
    expect(graphA.cycles.length).toBe(graphB.cycles.length);
  });
});

describe("findNode", () => {
  it("returns node and canonical key", () => {
    const ctx = resolver(filePaths(rootDir, ["src/oauth/provider.ts"]));
    const graph = buildGraph(project, filePaths(rootDir, ["src/oauth/provider.ts"]), ctx);
    const found = findNode(graph, path.join(rootDir, "src", "oauth", "provider.ts"), rootDir);
    expect(found).toBeDefined();
    expect(found!.parsed.exports.named).toContain("OAuthProvider");
    expect(found!.parsed.exports.named).toContain("authorize");
    expect(found!.parsed.exports.named).toContain("GrantType");
    expect(found!.parsed.symbols.classes).toEqual(["OAuthProvider"]);
    expect(found!.parsed.symbols.enums).toEqual(["GrantType"]);
  });

  it("returns undefined for unknown files", () => {
    const ctx = resolver([]);
    const graph = buildGraph(project, [], ctx);
    expect(findNode(graph, path.join(rootDir, "src", "ghost.ts"), rootDir)).toBeUndefined();
  });
});

describe("empty project", () => {
  it("builds an empty graph without cycles", () => {
    const ctx = resolver([]);
    const graph = buildGraph(project, [], ctx);
    expect(graph.nodes.size).toBe(0);
    expect(graph.cycles).toEqual([]);
  });
});
