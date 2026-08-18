import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { basicFixture, fixturePath } from "../helpers/fixtures.js";
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

  it("emits a SARIF report for a fixture file", { timeout }, () => {
    const result = runCli(["analyze", "src/authentication/login.ts", "--sarif"], basicFixture);
    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as {
      version: string;
      runs: Array<{
        tool: { driver: { name: string; version: string } };
        results: Array<{
          ruleId: string;
          level: string;
          locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
        }>;
      }>;
    };
    expect(doc.version).toBe("2.1.0");
    expect(doc.runs[0]!.tool.driver.name).toBe("ripple");
    const entry = doc.runs[0]!.results[0]!;
    expect(entry.ruleId).toBe("ripple/risk");
    expect(entry.level).toBe("warning");
    expect(entry.locations[0]!.physicalLocation.artifactLocation.uri).toBe(
      "src/authentication/login.ts",
    );
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

describe("ripple graph export formats", () => {
  const timeout = 90_000;

  it("exports the project graph as Mermaid", { timeout }, () => {
    const result = runCli(["graph", "--format", "mermaid"], basicFixture);
    expect(result.code).toBe(0);
    expect(result.stdout.startsWith("flowchart LR")).toBe(true);
    expect(result.stdout).toContain('"src/authentication/login.ts"');
    expect(result.stdout).toContain('"src/circular/a.ts"');
    expect(result.stdout).toContain("-->");
    expect(result.stdout).toContain("classDef cycle");
  });

  it("exports the project graph as Graphviz DOT", { timeout }, () => {
    const result = runCli(["graph", "--format", "dot"], basicFixture);
    expect(result.code).toBe(0);
    expect(result.stdout.startsWith("digraph ripple {")).toBe(true);
    expect(result.stdout).toContain('"src/authentication/login.ts"');
    expect(result.stdout).toContain('-> "src/authentication/oauth.ts"');
    expect(result.stdout).toContain('color="#f85149"');
  });

  it("exports the project graph as a self-contained HTML report", { timeout }, () => {
    const result = runCli(["graph", "--format", "html"], basicFixture);
    expect(result.code).toBe(0);
    expect(result.stdout.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(result.stdout).toContain("<b>25</b>"); // files
    expect(result.stdout).toContain("<h2>Circular dependencies</h2>");
    expect(result.stdout).toContain("<td>src/authentication/login.ts</td>");
  });

  it("scopes an export to a file's reachable subgraph", { timeout }, () => {
    const result = runCli(
      ["graph", "src/authentication/login.ts", "--format", "mermaid"],
      basicFixture,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('n0["src/authentication/login.ts"]');
    expect(result.stdout).toContain('"src/authentication/oauth.ts"');
    expect(result.stdout).not.toContain("src/circular/");
  });

  it("scopes a reverse export to the file's dependents", { timeout }, () => {
    const result = runCli(
      ["graph", "src/authentication/login.ts", "--format", "mermaid", "--reverse"],
      basicFixture,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"src/authentication/login.ts"');
    expect(result.stdout).toContain('"src/index.ts"');
    expect(result.stdout).not.toContain("src/authentication/oauth.ts");
  });

  it("rejects an unknown format", { timeout }, () => {
    const result = runCli(["graph", "--format", "svg"], basicFixture);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("expected one of terminal | json | mermaid | dot | html");
  });

  it("keeps export output free of progress noise", { timeout }, () => {
    const result = runCli(["graph", "--format", "mermaid"], basicFixture);
    expect(result.stdout).not.toMatch(/✔ Building/);
    expect(result.stdout).not.toMatch(/Loading config/);
  });
});

describe("ripple graph --json on an aliased project", () => {
  it("resolves aliased imports and keeps the stable contract", { timeout: 90_000 }, () => {
    const result = runCli(["graph", "--json"], fixturePath("aliases"));
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as {
      tool: string;
      command: string;
      fileCount: number;
      edgeCount: number;
      cycles: unknown[];
    };
    expect(report.tool).toBe("ripple");
    expect(report.command).toBe("graph");
    // Two sources plus the fixture's own ripple.config.ts (scanned as a node,
    // no edges).
    expect(report.fileCount).toBe(3);
    expect(report.edgeCount).toBe(1);
    expect(report.cycles).toHaveLength(0);
  });
});

describe("ripple --help examples", () => {
  const examples: Array<[string, string]> = [
    ["analyze", "ripple analyze src/authentication/login.ts"],
    ["graph", "ripple graph src/index.ts --reverse --depth 3"],
    ["diff", "ripple diff --base main --gate critical"],
    ["doctor", "ripple doctor -v"],
    ["init", "ripple init --force"],
    ["version", "ripple version"],
  ];

  for (const [command, example] of examples) {
    it(`shows a usage example for ${command}`, { timeout: 60_000 }, () => {
      const result = runCli([command, "--help"], basicFixture);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Examples:");
      expect(result.stdout).toContain(example);
    });
  }
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

  it("writes a minimal config that references the JSON Schema", { timeout: 90_000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-init-min-"));
    const result = runCli(["init"], dir);
    expect(result.code).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(dir, "ripple.config.json"), "utf8")) as {
      $schema: string;
      include: string[];
      risk?: unknown;
      diff?: unknown;
    };
    expect(config.$schema).toContain("ripple.schema.json");
    expect(config.include).toContain("**/*.{ts,tsx,js,jsx}");
    expect(config.risk).toBeUndefined();
    expect(config.diff).toBeUndefined();
  });

  it("writes the full defaults with --full", { timeout: 90_000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-init-full-"));
    const result = runCli(["init", "--full"], dir);
    expect(result.code).toBe(0);
    const config = JSON.parse(fs.readFileSync(path.join(dir, "ripple.config.json"), "utf8")) as {
      $schema: string;
      risk: { weights: Record<string, number>; thresholds: Record<string, number> };
      diff: { gate: string; allow: string[] };
    };
    expect(config.$schema).toContain("ripple.schema.json");
    expect(config.risk.weights.affectedFiles).toBe(0.3);
    expect(config.risk.thresholds.high).toBe(55);
    expect(config.diff.gate).toBe("high");
    expect(config.diff.allow).toEqual([]);
  });

  it("writes a typed ripple.config.ts with --ts", { timeout: 90_000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-init-ts-"));
    const result = runCli(["init", "--ts"], dir);
    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(dir, "ripple.config.ts"))).toBe(true);
    const content = fs.readFileSync(path.join(dir, "ripple.config.ts"), "utf8");
    expect(content).toContain('import type { RippleConfig } from "@alimaandev/ripple"');
    expect(content).toContain("export default config");
    expect(content).toContain("**/*.{ts,tsx,js,jsx}");
  });

  it("writes the full defaults as TypeScript with --ts --full", { timeout: 90_000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-init-ts-full-"));
    const result = runCli(["init", "--ts", "--full"], dir);
    expect(result.code).toBe(0);
    const content = fs.readFileSync(path.join(dir, "ripple.config.ts"), "utf8");
    expect(content).toContain("thresholds");
    expect(content).toContain("allow: []");
    expect(content).toContain("export default config");
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

  diffIt("reads base and gate from ripple.config", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    fs.writeFileSync(
      path.join(dir, "ripple.config.json"),
      '{ "diff": { "base": "HEAD", "gate": "critical" } }\n',
    );
    fs.writeFileSync(
      path.join(dir, "src", "b.ts"),
      'import { a } from "./a";\nexport const b = a + 1;\nexport const e = a * 2;\n',
    );

    const result = runCli(["diff", "--json"], dir);
    const report = JSON.parse(result.stdout) as {
      base: string;
      gate: { level: string; blocked: boolean };
    };
    expect(result.code).toBe(0);
    expect(report.base).toBe("HEAD");
    expect(report.gate).toMatchObject({ level: "critical", blocked: false });
  });

  diffIt("lets CLI flags override ripple.config diff settings", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    fs.writeFileSync(
      path.join(dir, "ripple.config.json"),
      '{ "diff": { "base": "HEAD", "gate": "critical" } }\n',
    );
    fs.writeFileSync(
      path.join(dir, "src", "b.ts"),
      'import { a } from "./a";\nexport const b = a + 1;\nexport const f = a * 2;\n',
    );

    const result = runCli(["diff", "--json", "--base", "main", "--gate", "medium"], dir);
    const report = JSON.parse(result.stdout) as {
      base: string;
      gate: { level: string; blocked: boolean };
    };
    expect(report.base).toBe("main");
    expect(report.gate.level).toBe("medium");
  });

  diffIt("emits github workflow annotations", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    fs.writeFileSync(
      path.join(dir, "src", "b.ts"),
      'import { a } from "./a";\nexport const b = a + 1;\nexport const g = a * 2;\n',
    );

    const result = runCli(["diff", "--format", "github", "--gate", "critical"], dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("::warning file=src/b.ts,title=Ripple LOW");
    expect(result.stdout).toContain("::notice title=Ripple diff critical gate");
    expect(result.stdout).toContain("Gate passed");
  });

  diffIt("emits SARIF 2.1.0 for code scanning", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    fs.writeFileSync(
      path.join(dir, "src", "b.ts"),
      'import { a } from "./a";\nexport const b = a + 1;\nexport const g = a * 2;\n',
    );

    const result = runCli(["diff", "--format", "sarif", "--gate", "critical"], dir);
    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as {
      version: string;
      runs: Array<{
        tool: { driver: { name: string } };
        results: Array<{
          ruleId: string;
          level: string;
          locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
          partialFingerprints: Record<string, string>;
        }>;
      }>;
    };
    expect(doc.version).toBe("2.1.0");
    expect(doc.runs[0]!.tool.driver.name).toBe("ripple");
    const entry = doc.runs[0]!.results[0]!;
    expect(entry.ruleId).toBe("ripple/risk");
    expect(entry.level).toBe("note");
    expect(entry.locations[0]!.physicalLocation.artifactLocation.uri).toBe("src/b.ts");
    expect(entry.partialFingerprints.primaryLocationLineHash).toMatch(/^[0-9a-f]{64}$/);
  });

  diffIt("rejects unknown --format values", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    const result = runCli(["diff", "--format", "xml"], dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("expected one of terminal | json | github | sarif");
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

describe("ripple diff allowlist", () => {
  let hasGit = true;
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
  } catch {
    hasGit = false;
  }
  const diffIt = hasGit ? it : it.skip;

  function writeTree(dir: string): void {
    fs.mkdirSync(path.join(dir, "src", "legacy"), { recursive: true });
    fs.mkdirSync(path.join(dir, "src", "app"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "legacy", "old.ts"), "export const old = 1;\n");
    fs.writeFileSync(
      path.join(dir, "src", "app", "app.ts"),
      'import { old } from "../legacy/old";\nexport const app = old + 1;\n',
    );
    execFileSync("git", ["add", "."], { cwd: dir, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "baseline"], { cwd: dir, stdio: "ignore" });
  }

  diffIt("lets --allow exempt changed files from blocking the gate", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    // A low `high` threshold guarantees the legacy change blocks the gate
    // unless it is allowlisted.
    fs.writeFileSync(
      path.join(dir, "ripple.config.json"),
      '{ "risk": { "thresholds": { "medium": 1, "high": 1, "critical": 100 } } }\n',
    );
    // Making the legacy file grow many dependents drives its risk score up.
    fs.writeFileSync(
      path.join(dir, "src", "legacy", "old.ts"),
      "export const old = 1;\nexport const extra = 2;\nexport const more = 3;\n",
    );

    const blocked = runCli(["diff", "--json", "--base", "HEAD"], dir);
    const blockedReport = JSON.parse(blocked.stdout) as {
      gate: { blocked: boolean; counts: { high: number; critical: number } };
    };
    expect(blocked.code).toBe(1);
    expect(blockedReport.gate.blocked).toBe(true);

    const allowed = runCli(["diff", "--json", "--base", "HEAD", "--allow", "src/legacy/**"], dir);
    const allowedReport = JSON.parse(allowed.stdout) as {
      gate: { blocked: boolean; allowed: number };
      files: Array<{ file: string; allowed?: boolean }>;
    };
    expect(allowed.code).toBe(0);
    expect(allowedReport.gate.blocked).toBe(false);
    expect(allowedReport.gate.allowed).toBeGreaterThanOrEqual(1);
    expect(allowedReport.files.find((f) => f.file === "src/legacy/old.ts")?.allowed).toBe(true);
  });

  diffIt("reads diff.allow from ripple.config", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    fs.writeFileSync(
      path.join(dir, "ripple.config.json"),
      '{ "diff": { "base": "HEAD", "gate": "high", "allow": ["src/legacy/**"] } }\n',
    );
    fs.writeFileSync(
      path.join(dir, "src", "legacy", "old.ts"),
      "export const old = 1;\nexport const extra = 2;\n",
    );

    const result = runCli(["diff", "--json"], dir);
    const report = JSON.parse(result.stdout) as {
      gate: { blocked: boolean; allowed: number };
    };
    expect(result.code).toBe(0);
    expect(report.gate.blocked).toBe(false);
    expect(report.gate.allowed).toBeGreaterThanOrEqual(1);
  });

  diffIt("keeps allowlisted files out of github annotations", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    fs.writeFileSync(
      path.join(dir, "src", "legacy", "old.ts"),
      "export const old = 1;\nexport const extra = 2;\n",
    );

    const result = runCli(
      ["diff", "--format", "github", "--base", "HEAD", "--allow", "src/legacy/**"],
      dir,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("file=src/legacy/old.ts");
    expect(result.stdout).toContain("Gate passed");
  });

  diffIt("marks allowlisted files in the terminal report", { timeout: 90_000 }, () => {
    const dir = gitRepo();
    writeTree(dir);
    fs.writeFileSync(
      path.join(dir, "src", "legacy", "old.ts"),
      "export const old = 1;\nexport const extra = 2;\n",
    );

    const result = runCli(["diff", "--base", "HEAD", "--allow", "src/legacy/**"], dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Allowed");
    expect(result.stdout).toContain("(allowed)");
    expect(result.stdout).toContain("Gate passed");
  });
});

describe("ripple mcp", () => {
  const timeout = 90_000;

  it("serves the ripple tools over stdio and analyzes a file", { timeout }, async () => {
    const child = spawn(process.execPath, [jitiCli, bin, "mcp"], {
      cwd: basicFixture,
      env: { ...process.env, JITI_DEBUG: "0", NO_COLOR: "1" },
    });
    let stdout = "";
    const stderr: string[] = [];
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
    const closed = new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "it" } },
      })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "impact", arguments: { file: "src/authentication/login.ts" } },
      })}\n`,
    );
    child.stdin.end();

    const code = await closed;
    expect(code).toBe(0);
    const responses = stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(responses).toHaveLength(3);
    const initialize = responses[0]!.result as {
      serverInfo: { name: string };
      protocolVersion: string;
    };
    expect(initialize.serverInfo.name).toBe("ripple");
    expect(initialize.protocolVersion).toBe("2025-06-18");
    const tools = (responses[1]!.result as { tools: Array<{ name: string }> }).tools.map(
      (tool) => tool.name,
    );
    expect(tools).toEqual(["impact", "dependents", "risk", "gate_status"]);
    const impact = responses[2]!.result as {
      content: Array<{ text: string }>;
      isError?: boolean;
    };
    expect(impact.isError).toBeUndefined();
    const payload = JSON.parse(impact.content[0]!.text) as {
      file: string;
      risk: { score: number; level: string };
      summary: { affectedFiles: number };
    };
    expect(payload.file).toBe("src/authentication/login.ts");
    expect(payload.risk.level).toBe("MEDIUM");
    expect(payload.summary.affectedFiles).toBe(7);
    expect(stderr.join("")).toBe("");
  });

  it("turns a failed tool call into an isError result and keeps serving", { timeout }, async () => {
    const child = spawn(process.execPath, [jitiCli, bin, "mcp"], {
      cwd: basicFixture,
      env: { ...process.env, JITI_DEBUG: "0", NO_COLOR: "1" },
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    const closed = new Promise<number | null>((resolve) => {
      child.on("close", (code) => resolve(code));
    });

    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "risk", arguments: { file: "src/does-not-exist.ts" } } })}\n`,
    );
    child.stdin.end();

    const code = await closed;
    expect(code).toBe(0);
    const response = JSON.parse(stdout.trim()) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0]!.text).toContain("not found in the project graph");
  });
});
