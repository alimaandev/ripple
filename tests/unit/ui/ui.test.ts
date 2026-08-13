import chalk from "chalk";
import { afterEach, describe, expect, it } from "vitest";
import { brandHeader, sectionHeader } from "../../../src/ui/brand.js";
import { resolveColor } from "../../../src/ui/color.js";
import { filledCells, riskGauge } from "../../../src/ui/gauge.js";
import { icon } from "../../../src/ui/icons.js";
import { createStageTracker } from "../../../src/ui/progress.js";

describe("icons", () => {
  it("resolves every named glyph", () => {
    const names = [
      "tick",
      "cross",
      "warning",
      "info",
      "arrowRight",
      "pointer",
      "bullet",
      "ellipsis",
      "circle",
    ] as const;
    for (const name of names) {
      expect(icon(name).length).toBeGreaterThan(0);
    }
  });
});

describe("brandHeader", () => {
  it("renders a plain one-liner without color", () => {
    expect(brandHeader({ label: "impact analysis", style: { color: false } })).toBe(
      "ripple — impact analysis",
    );
    expect(
      brandHeader({ label: "impact analysis", version: "1.2.3", style: { color: false } }),
    ).toBe("ripple — impact analysis · v1.2.3");
  });

  it("renders a flat brand line with color", () => {
    const previous = chalk.level;
    chalk.level = 1;
    try {
      const output = brandHeader({
        label: "dependency graph",
        version: "1.2.3",
        style: { color: true },
      });
      // eslint-disable-next-line no-control-regex -- ANSI escape stripping in tests
      const stripped = output.replace(/\u001b\[[0-9;]*m/g, "");
      expect(stripped).toBe("ripple · dependency graph · v1.2.3");
      expect(output).not.toContain("╭");
    } finally {
      chalk.level = previous;
    }
  });
});

describe("sectionHeader", () => {
  it("returns the title as-is without color", () => {
    expect(sectionHeader("Top impact", { color: false })).toBe("Top impact");
  });

  it("prepends a caret with color", () => {
    const previous = chalk.level;
    chalk.level = 1;
    try {
      const output = sectionHeader("Top impact", { color: true });
      // eslint-disable-next-line no-control-regex -- ANSI escape stripping in tests
      const stripped = output.replace(/\u001b\[[0-9;]*m/g, "");
      expect(stripped).toBe("› Top impact");
    } finally {
      chalk.level = previous;
    }
  });
});

describe("riskGauge", () => {
  it("is empty without color", () => {
    expect(riskGauge(50, "MEDIUM", { color: false })).toBe("");
  });

  it("fills cells proportionally to the score", () => {
    expect(filledCells(0)).toBe(0);
    expect(filledCells(10)).toBe(1);
    expect(filledCells(34.4)).toBe(3);
    expect(filledCells(55)).toBe(6);
    expect(filledCells(100)).toBe(10);
    expect(filledCells(200)).toBe(10);
  });

  it("renders the bar with color", () => {
    const previous = chalk.level;
    chalk.level = 1;
    try {
      const gauge = riskGauge(34.4, "MEDIUM", { color: true });
      expect(gauge).toContain("███");
      expect(gauge).toContain("░░░");
    } finally {
      chalk.level = previous;
    }
  });
});

describe("createStageTracker", () => {
  it("is a no-op when disabled", () => {
    const tracker = createStageTracker(false);
    expect(() => {
      tracker.next("a");
      tracker.next("b");
      tracker.done();
    }).not.toThrow();
  });
});

describe("resolveColor", () => {
  const original = process.env.NO_COLOR;

  afterEach(() => {
    if (original === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = original;
  });

  it("respects the explicit flag", () => {
    expect(resolveColor(false)).toBe(false);
    expect(resolveColor(true)).toBe(true);
  });

  it("honors NO_COLOR", () => {
    process.env.NO_COLOR = "1";
    expect(resolveColor(undefined)).toBe(false);
    delete process.env.NO_COLOR;
    expect(resolveColor(undefined)).toBe(true);
  });
});
