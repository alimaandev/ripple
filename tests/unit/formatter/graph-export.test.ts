import { describe, expect, it } from "vitest";
import {
  renderDotGraph,
  renderHtmlGraph,
  renderMermaidGraph,
  type GraphExportInput,
} from "../../../src/formatter/graph-export.js";

const cwd = "/project";

function input(overrides: Partial<GraphExportInput> = {}): GraphExportInput {
  return {
    nodes: new Map([
      ["/project/src/index.ts", "/project/src/index.ts"],
      ["/project/src/app.ts", "/project/src/app.ts"],
      ["/project/src/circular/a.ts", "/project/src/circular/a.ts"],
      ["/project/src/circular/b.ts", "/project/src/circular/b.ts"],
      ["/project/src/circular/c.ts", "/project/src/circular/c.ts"],
    ]),
    edges: new Map([
      ["/project/src/index.ts", new Set(["/project/src/app.ts"])],
      ["/project/src/circular/a.ts", new Set(["/project/src/circular/c.ts"])],
      ["/project/src/circular/c.ts", new Set(["/project/src/circular/b.ts"])],
      ["/project/src/circular/b.ts", new Set(["/project/src/circular/a.ts"])],
    ]),
    cycles: [
      {
        members: [
          "/project/src/circular/a.ts",
          "/project/src/circular/b.ts",
          "/project/src/circular/c.ts",
        ],
        path: [
          "/project/src/circular/a.ts",
          "/project/src/circular/c.ts",
          "/project/src/circular/b.ts",
          "/project/src/circular/a.ts",
        ],
      },
    ],
    cwd,
    ...overrides,
  };
}

describe("renderMermaidGraph", () => {
  it("emits a flowchart with relative node labels and sorted edges", () => {
    const output = renderMermaidGraph(input());
    expect(output.startsWith("flowchart LR")).toBe(true);
    // IDs are assigned in sorted-label order: app, circular/a, b, c, index.
    expect(output).toContain('n4["src/index.ts"]');
    expect(output).toContain('n0["src/app.ts"]');
    expect(output).toContain("n4 --> n0");
    expect(output.indexOf("n4 --> n0")).toBeGreaterThan(output.indexOf("n0 --> n1"));
  });

  it("marks cycle members with a class", () => {
    const output = renderMermaidGraph(input());
    expect(output).toContain("classDef cycle");
    expect(output).toContain("class n1,n2,n3 cycle;");
  });

  it("escapes double quotes and hashes in labels", () => {
    const escaped = renderMermaidGraph(
      input({ nodes: new Map([["/project/weird#name.ts", "/project/weird#name.ts"]]) }),
    );
    expect(escaped).toContain('n0["weird#35;name.ts"]');
  });

  it("is deterministic across runs", () => {
    expect(renderMermaidGraph(input())).toBe(renderMermaidGraph(input()));
  });
});

describe("renderDotGraph", () => {
  it("emits a digraph with quoted, escaped labels", () => {
    const output = renderDotGraph(input());
    expect(output.startsWith("digraph ripple {")).toBe(true);
    expect(output).toContain('"src/index.ts" [label="src/index.ts"];');
    expect(output).toContain('"src/index.ts" -> "src/app.ts";');
  });

  it("escapes double quotes in DOT labels", () => {
    const output = renderDotGraph(
      input({ nodes: new Map([['/project/a"b.ts', '/project/a"b.ts']]) }),
    );
    expect(output).toContain('"a\\"b.ts" [label="a\\"b.ts"];');
  });

  it("highlights cycle members in red", () => {
    const output = renderDotGraph(input());
    expect(output).toContain('"src/circular/a.ts" [color="#f85149", penwidth=1.5];');
  });
});

describe("renderHtmlGraph", () => {
  it("produces a self-contained document with stats and an edge table", () => {
    const output = renderHtmlGraph(input());
    expect(output.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(output).toContain("<b>5</b>");
    expect(output).toContain("<b>4</b>");
    expect(output).toContain("<td>src/index.ts</td>");
    expect(output).toContain("src/circular/a.ts &#8594; src/circular/c.ts");
  });

  it("escapes HTML-sensitive characters", () => {
    const output = renderHtmlGraph(
      input({ nodes: new Map([["/project/<x&y>.ts", "/project/<x&y>.ts"]]) }),
    );
    expect(output).not.toContain("<x&y>");
    expect(output).toContain("&lt;x&amp;y&gt;.ts");
  });

  it("skips cycle paths whose members are outside the exported subgraph", () => {
    const output = renderHtmlGraph(
      input({
        nodes: new Map([
          ["/project/src/index.ts", "/project/src/index.ts"],
          ["/project/src/app.ts", "/project/src/app.ts"],
        ]),
        cycles: [
          {
            members: ["/project/outside.ts"],
            path: ["/project/outside.ts", "/project/outside.ts"],
          },
        ],
        edges: new Map(),
      }),
    );
    expect(output).toContain("<li><em>none</em></li>");
  });
});
