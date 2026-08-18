import { describe, expect, it } from "vitest";
import { fixturePath } from "../../helpers/fixtures.js";
import { loadProjectContext } from "../../../src/config/loader.js";
import { runPipeline } from "../../../src/commands/pipeline.js";
import { createMcpTools, type ProjectSnapshot } from "../../../src/mcp/tools.js";
import type { McpToolResult } from "../../../src/mcp/server.js";

const aliasesFixture = fixturePath("aliases");

async function snapshot(): Promise<ProjectSnapshot> {
  const context = await loadProjectContext(aliasesFixture);
  const { graph, entryPoints } = await runPipeline(context);
  return { context, graph, entryPoints };
}

function tools(
  snapshot: ProjectSnapshot,
  getChanged?: (base?: string) => ReturnType<typeof Object>,
) {
  return createMcpTools({
    cwd: aliasesFixture,
    loadProject: async () => snapshot,
    getChanged:
      getChanged ??
      (() => {
        throw new Error("No git base ref found (tried origin/main, main, HEAD~1)");
      }),
  });
}

function byName(tools: ReturnType<typeof createMcpTools>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

async function call(
  tool: ReturnType<typeof createMcpTools>[number],
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  return tool.handler(args);
}

describe("ripple mcp tools", () => {
  const snapPromise = snapshot();

  it("exposes the four planned tools with schemas", async () => {
    const snap = await snapPromise;
    const names = tools(snap).map((tool) => tool.name);
    expect(names).toEqual(["impact", "dependents", "risk", "gate_status"]);
    for (const tool of tools(snap)) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("impact reports the blast radius of a file", async () => {
    const snap = await snapPromise;
    const result = await call(byName(tools(snap), "impact"), { file: "app/hello.ts" });
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.text) as {
      file: string;
      risk: { score: number; level: string };
      summary: { affectedFiles: number; maxDepth: number; confidence: number };
    };
    expect(payload.file).toBe("app/hello.ts");
    expect(payload.summary.affectedFiles).toBe(1);
    expect(payload.summary.maxDepth).toBe(1);
    expect(payload.risk.level).toBeDefined();
    expect(payload.risk.score).toBeGreaterThanOrEqual(0);
  });

  it("impact accepts a maxDepth cap", async () => {
    const snap = await snapPromise;
    const result = await call(byName(tools(snap), "impact"), {
      file: "app/hello.ts",
      maxDepth: 1,
    });
    expect(result.isError).toBeUndefined();
  });

  it("impact fails cleanly for missing arguments", async () => {
    const snap = await snapPromise;
    const result = await call(byName(tools(snap), "impact"), {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Missing required argument "file"');
  });

  it("impact fails cleanly for unknown files", async () => {
    const snap = await snapPromise;
    const result = await call(byName(tools(snap), "impact"), { file: "src/nope.ts" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not found in the project graph");
  });

  it("dependents lists direct dependents by default", async () => {
    const snap = await snapPromise;
    const result = await call(byName(tools(snap), "dependents"), { file: "app/hello.ts" });
    const payload = JSON.parse(result.text) as {
      depth: number;
      count: number;
      dependents: Array<{ path: string; depth: number; direct: boolean }>;
    };
    expect(payload.depth).toBe(1);
    expect(payload.count).toBe(1);
    expect(payload.dependents[0]).toMatchObject({
      path: "src/index.ts",
      depth: 1,
      direct: true,
    });
  });

  it("risk returns the score with a factor breakdown", async () => {
    const snap = await snapPromise;
    const result = await call(byName(tools(snap), "risk"), { file: "app/hello.ts" });
    const payload = JSON.parse(result.text) as {
      score: number;
      level: string;
      targetInCycle: boolean;
      factors: Array<{ name: string; label: string; contribution: number }>;
    };
    expect(payload.score).toBeGreaterThanOrEqual(0);
    expect(payload.level).toMatch(/^(LOW|MEDIUM|HIGH|CRITICAL)$/);
    expect(Array.isArray(payload.factors)).toBe(true);
    expect(payload.targetInCycle).toBe(false);
  });

  it("gate_status reports the change set verdict against the gate", async () => {
    const snap2 = await snapshot();
    const mcpTools = tools(snap2, () => ({
      baseLabel: "origin/main",
      files: ["src/index.ts"],
    }));
    const result = await call(byName(mcpTools, "gate_status"), { gate: "critical" });
    const payload = JSON.parse(result.text) as {
      base: string;
      changedFiles: number;
      files: Array<{ file: string; analyzed: boolean; level: string }>;
      counts: Record<string, number>;
      gate: { level: string; blocked: boolean; verdict: string };
    };
    expect(payload.base).toBe("origin/main");
    expect(payload.changedFiles).toBe(1);
    expect(payload.files[0]).toMatchObject({ file: "src/index.ts", analyzed: true });
    expect(payload.gate).toMatchObject({ level: "critical", verdict: "pass" });
    expect(payload.counts).toHaveProperty("low");
  });

  it("gate_status reports the gate verdict even with a default base", async () => {
    const snap2 = await snapshot();
    const mcpTools = tools(snap2, () => ({
      baseLabel: "HEAD",
      files: ["src/index.ts"],
    }));
    const result = await call(byName(mcpTools, "gate_status"), {});
    const payload = JSON.parse(result.text) as {
      gate: { level: string; verdict: string };
    };
    expect(payload.gate.level).toBe("high");
  });

  it("gate_status fails cleanly outside a git repository", async () => {
    const snap = await snapPromise;
    const result = await call(byName(tools(snap), "gate_status"), {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("git");
  });
});
