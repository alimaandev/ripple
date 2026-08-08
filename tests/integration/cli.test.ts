import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { basicFixture } from "../helpers/fixtures.js";
import { fileURLToPath } from "node:url";

/**
 * End-to-end CLI tests: spawn the real program (via jiti) against the `basic`
 * fixture and assert on exit codes, stdout and stderr.
 */

const require = createRequire(import.meta.url);
const jitiCli = path.join(
  path.dirname(require.resolve("jiti/package.json")),
  "lib",
  "jiti-cli.mjs",
);
const bin = fileURLToPath(new URL("../../src/cli/bin.ts", import.meta.url));

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd: string): CliResult {
  try {
    const stdout = execFileSync(process.execPath, [jitiCli, bin, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, JITI_DEBUG: "0", NO_COLOR: "1" },
      timeout: 60_000,
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const detail = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: detail.status ?? 1,
      stdout: detail.stdout ?? "",
      stderr: detail.stderr ?? "",
    };
  }
}

describe("ripple analyze", () => {
  const timeout = 90_000;

  it("emits a JSON report for a fixture file", { timeout }, () => {
    const result = runCli(["analyze", "src/authentication/login.ts", "--json"], basicFixture);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as {
      tool: string;
      command: string;
      file: string;
      risk: { level: string; score: number };
      summary: { affectedFiles: number; maxDepth: number };
      targetInCycle: boolean;
    };
    expect(report.tool).toBe("ripple");
    expect(report.command).toBe("analyze");
    expect(report.file).toBe("src/authentication/login.ts");
    expect(report.risk.level).toBe("MEDIUM");
    expect(report.risk.score).toBeGreaterThanOrEqual(30);
    expect(report.risk.score).toBeLessThan(55);
    expect(report.summary.affectedFiles).toBe(7);
    expect(report.summary.maxDepth).toBe(2);
    expect(report.targetInCycle).toBe(false);
  });

  it("renders a terminal report without --json", { timeout: 90_000 }, () => {
    const result = runCli(["analyze", "src/authentication/login.ts"], basicFixture);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("impact analysis");
    expect(result.stdout).toContain("MEDIUM");
    expect(result.stdout).toContain("Affected files");
  });

  it("exits 2 for a missing file", { timeout: 90_000 }, () => {
    const result = runCli(["analyze", "src/does-not-exist.ts", "--json"], basicFixture);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("File not found");
  });

  it("analyzes files that nobody imports", { timeout: 90_000 }, () => {
    const result = runCli(["analyze", "src/main.ts", "--json"], basicFixture);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as { summary: { affectedFiles: number } };
    expect(report.summary.affectedFiles).toBe(0);
  });

  it("flags cycle membership for circular files", { timeout: 90_000 }, () => {
    const result = runCli(["analyze", "src/circular/c.ts", "--json"], basicFixture);
    const report = JSON.parse(result.stdout) as { targetInCycle: boolean; cycles: unknown[] };
    expect(report.targetInCycle).toBe(true);
    expect(report.cycles).toHaveLength(1);
  });
});

describe("ripple graph", () => {
  it("emits project stats for JSON", { timeout: 90_000 }, () => {
    const result = runCli(["graph", "--json"], basicFixture);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as {
      fileCount: number;
      edgeCount: number;
      cycles: unknown[];
    };
    expect(report.fileCount).toBe(25);
    expect(report.edgeCount).toBeGreaterThan(0);
    expect(report.cycles).toHaveLength(1);
  });

  it("lists a file's forward dependants", { timeout: 90_000 }, () => {
    const result = runCli(["graph", "src/index.ts", "--json"], basicFixture);
    const report = JSON.parse(result.stdout) as { forward: string[] };
    expect(report.forward).toContain("src/authentication/login.ts");
    expect(report.forward).toContain("src/utils/format.ts");
  });

  it("lists reverse dependents with --reverse", { timeout: 90_000 }, () => {
    const result = runCli(
      ["graph", "src/authentication/login.ts", "--reverse", "--json"],
      basicFixture,
    );
    const report = JSON.parse(result.stdout) as { reverse: string[] };
    expect(report.reverse).toContain("src/index.ts");
  });

  it("renders a terminal report", { timeout: 90_000 }, () => {
    const result = runCli(["graph"], basicFixture);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("dependency graph");
    expect(result.stdout).toContain("Circular groups  1");
    expect(result.stdout).toContain("src/circular/a.ts → src/circular/c.ts");
  });
});

describe("ripple doctor", () => {
  it("reports a healthy project (cycle warning expected in fixture)", { timeout: 90_000 }, () => {
    const result = runCli(["doctor"], basicFixture);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("project health check");
    expect(result.stdout).toContain("package.json");
    expect(result.stdout).toContain("import resolution");
    expect(result.stdout).toContain("circular dependencies");
  });

  it("exits 1 when a project has no source files", { timeout: 90_000 }, () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-doctor-"));
    fs.writeFileSync(
      path.join(emptyDir, "package.json"),
      '{ "name": "empty", "version": "0.0.0" }\n',
    );
    const result = runCli(["doctor"], emptyDir);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("source files");
  });
});

describe("ripple version", () => {
  it("prints the package version", { timeout: 90_000 }, () => {
    const result = runCli(["version"], basicFixture);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("ripple init", () => {
  it("writes a config and refuses to overwrite without --force", { timeout: 90_000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-init-"));
    const first = runCli(["init"], dir);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("ripple.config.json");
    expect(fs.existsSync(path.join(dir, "ripple.config.json"))).toBe(true);

    const second = runCli(["init"], dir);
    expect(second.code).toBe(1);

    const forced = runCli(["init", "--force"], dir);
    expect(forced.code).toBe(0);
  });
});

function gitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-diff-"));
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  };
  git("init", "-b", "main");
  git("config", "user.email", "test@ripple.dev");
  git("config", "user.name", "Ripple Test");
  return dir;
}

describe("ripple diff", () => {
  let hasGit = true;
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
  } catch {
    hasGit = false;
  }
  const diffIt = hasGit ? it : it.skip;

  function writeTree(dir: string): void {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "a.ts"), "export const a = 1;\n");
    fs.writeFileSync(
      path.join(dir, "src", "b.ts"),
      'import { a } from "./a";\nexport const b = a + 1;\n',
    );
    fs.writeFileSync(
      path.join(dir, "src", "main.ts"),
      'import { b } from "./b";\nconsole.log(b);\n',
    );
    execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "baseline"], { cwd: dir, stdio: "ignore" });
  }

  diffIt("analyzes the change set and gates it consistently", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    fs.writeFileSync(
      path.join(dir, "src", "b.ts"),
      'import { a } from "./a";\nexport const b = a + 1;\nexport const c = a + 2;\n',
    );

    const result = runCli(["diff", "--json"], dir);
    const report = JSON.parse(result.stdout) as {
      tool: string;
      command: string;
      base: string;
      changedFiles: number;
      files: Array<{ file: string; analyzed: boolean }>;
      gate: { level: string; blocked: boolean };
    };

    expect(report.tool).toBe("ripple");
    expect(report.command).toBe("diff");
    expect(report.base).not.toBe("");
    expect(report.changedFiles).toBeGreaterThanOrEqual(1);
    expect(report.files[0]!.file).toBe("src/b.ts");
    expect(report.files[0]!.analyzed).toBe(true);
    expect(result.code).toBe(report.gate.blocked ? 1 : 0);
  });

  diffIt("passes with --gate critical when nothing is critical", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    fs.writeFileSync(
      path.join(dir, "src", "b.ts"),
      'import { a } from "./a";\nexport const b = a + 1;\nexport const d = a * 2;\n',
    );

    const result = runCli(["diff", "--json", "--gate", "critical"], dir);
    const report = JSON.parse(result.stdout) as { gate: { level: string; blocked: boolean } };
    expect(result.code).toBe(0);
    expect(report.gate).toMatchObject({ level: "critical", blocked: false });
  });

  diffIt("renders a terminal report", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);

    const result = runCli(["diff", "--base", "HEAD"], dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("diff vs HEAD");
    expect(result.stdout).toContain("Gate passed");
  });

  diffIt("exits 2 outside a git repository", { timeout: 90_000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-nogit-"));
    const result = runCli(["diff", "--base", "main"], dir);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Git ref not found");
  });
});
