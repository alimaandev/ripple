import chalk from "chalk";
import { describe, expect, it } from "vitest";
import { renderKeyValue, renderTable } from "../../../src/formatter/table.js";
import { renderTree, type TreeNode } from "../../../src/formatter/tree.js";
import { serializeJson } from "../../../src/formatter/json.js";
import {
  confidenceText,
  formatDuration,
  pluralize,
  riskBadge,
} from "../../../src/formatter/text.js";
import { InMemoryWriter } from "../../../src/output/writer.js";

describe("renderKeyValue", () => {
  it("aligns values", () => {
    const output = renderKeyValue([
      ["Risk", "HIGH"],
      ["Affected Files", "7 files"],
    ]);
    expect(output).toBe("Risk            HIGH\nAffected Files  7 files");
  });
});

describe("renderTable", () => {
  it("pads columns", () => {
    const output = renderTable(
      [{ header: "Factor" }, { header: "Points", align: "right" }],
      [
        ["Affected files", "13.50"],
        ["Tests", "1.00"],
      ],
    );
    const lines = output.split("\n");
    expect(lines[0]).toBe("Factor          Points");
    expect(lines[1]).toBe("Affected files   13.50");
    expect(lines[2]).toBe("Tests             1.00");
  });
});

describe("renderTree", () => {
  it("renders nested nodes", () => {
    const nodes: TreeNode[] = [
      {
        label: "src/index.ts (depth 1)",
        children: [{ label: "src/main.ts (depth 2)" }],
      },
      { label: "src/app/page.tsx (depth 1)" },
    ];
    const output = renderTree(nodes);
    expect(output).toContain("├─ src/index.ts (depth 1)");
    expect(output).toContain("│  └─ src/main.ts (depth 2)");
    expect(output).toContain("└─ src/app/page.tsx (depth 1)");
    expect(output).not.toContain(": true");
  });

  it("returns empty string for no nodes", () => {
    expect(renderTree([])).toBe("");
  });
});

describe("serializeJson", () => {
  it("pretty-prints with a trailing newline", () => {
    expect(serializeJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});

describe("text helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(42)).toBe("42ms");
    expect(formatDuration(1500)).toBe("1.50s");
  });

  it("pluralizes", () => {
    expect(pluralize(1, "file")).toBe("1 file");
    expect(pluralize(2, "file")).toBe("2 files");
  });

  it("renders plain badges without color", () => {
    expect(riskBadge("HIGH", { color: false })).toBe("HIGH");
    expect(confidenceText(93, { color: false })).toBe("93%");
  });

  it("renders colored badges when color is enabled and supported", () => {
    const previous = chalk.level;
    chalk.level = 1;
    try {
      expect(riskBadge("CRITICAL", { color: true })).toContain("\u001b[");
      expect(confidenceText(93, { color: true })).toContain("\u001b[");
      expect(riskBadge("CRITICAL", { color: false })).toBe("CRITICAL");
    } finally {
      chalk.level = previous;
    }
  });
});

describe("InMemoryWriter", () => {
  it("captures writes", () => {
    const writer = new InMemoryWriter();
    writer.write("a");
    writer.writeLine("b");
    writer.writeLine();
    expect(writer.output).toBe("ab\n\n");
    expect(writer.lines).toEqual(["ab", ""]);
  });
});
