import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../../../src/commands/init.js";
import type { CommandContext, OutputWriter } from "../../../src/types/cli.js";

function memoryWriter(): OutputWriter & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    write: (text: string) => lines.push(text),
    writeLine: (text: string = "") => lines.push(text),
  };
}

function contextFor(cwd: string): { ctx: CommandContext; writer: ReturnType<typeof memoryWriter> } {
  const writer = memoryWriter();
  return {
    writer,
    ctx: { writer, errorWriter: memoryWriter(), cwd, version: "0.0.0-test" },
  };
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("initCommand", () => {
  it("writes a minimal json config referencing the schema", async () => {
    const dir = tempDir("ripple-unit-init-");
    const { ctx, writer } = contextFor(dir);

    const code = await initCommand({ force: false }, ctx);

    expect(code).toBe(0);
    expect(writer.lines.some((line) => line.includes("Wrote ripple.config.json"))).toBe(true);
    const config = JSON.parse(fs.readFileSync(path.join(dir, "ripple.config.json"), "utf8")) as {
      $schema: string;
      include: string[];
      risk?: unknown;
    };
    expect(config.$schema).toContain("ripple.schema.json");
    expect(config.include).toEqual(["**/*.{ts,tsx,js,jsx}"]);
    expect(config.risk).toBeUndefined();
  });

  it("writes the full defaults with --full", async () => {
    const dir = tempDir("ripple-unit-init-full-");
    const { ctx } = contextFor(dir);

    const code = await initCommand({ force: false, full: true }, ctx);

    expect(code).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(dir, "ripple.config.json"), "utf8")) as {
      $schema: string;
      risk: { thresholds: { high: number } };
      diff: { gate: string; allow: string[] };
      ignore: string[];
    };
    expect(config.$schema).toContain("ripple.schema.json");
    expect(config.risk.thresholds.high).toBe(55);
    expect(config.diff.gate).toBe("high");
    expect(config.diff.allow).toEqual([]);
    expect(config.ignore.length).toBeGreaterThan(0);
  });

  it("writes a typed ts config with --ts", async () => {
    const dir = tempDir("ripple-unit-init-ts-");
    const { ctx } = contextFor(dir);

    const code = await initCommand({ force: false, ts: true }, ctx);

    expect(code).toBe(0);
    const content = fs.readFileSync(path.join(dir, "ripple.config.ts"), "utf8");
    expect(content).toContain('import type { RippleConfig } from "@alimaandev/ripple"');
    expect(content).toContain("export default config");
    expect(content).toContain("**/*.{ts,tsx,js,jsx}");
  });

  it("renders the full defaults as a valid ts literal with --ts --full", async () => {
    const dir = tempDir("ripple-unit-init-ts-full-");
    const { ctx } = contextFor(dir);

    const code = await initCommand({ force: false, ts: true, full: true }, ctx);

    expect(code).toBe(0);
    const content = fs.readFileSync(path.join(dir, "ripple.config.ts"), "utf8");
    expect(content).toContain("thresholds");
    expect(content).toContain("allow: []");
    expect(content).not.toContain("undefined");
  });

  it("refuses to overwrite without --force", async () => {
    const dir = tempDir("ripple-unit-init-exists-");
    fs.writeFileSync(path.join(dir, "ripple.config.json"), "{}");
    const { ctx, writer } = contextFor(dir);

    const code = await initCommand({ force: false }, ctx);

    expect(code).toBe(1);
    expect(writer.lines.some((line) => line.includes("already exists"))).toBe(true);
  });

  it("overwrites with --force", async () => {
    const dir = tempDir("ripple-unit-init-force-");
    fs.writeFileSync(path.join(dir, "ripple.config.json"), "{}");
    const { ctx } = contextFor(dir);

    const code = await initCommand({ force: true }, ctx);

    expect(code).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(dir, "ripple.config.json"), "utf8")) as {
      $schema: string;
    };
    expect(config.$schema).toContain("ripple.schema.json");
  });
});
