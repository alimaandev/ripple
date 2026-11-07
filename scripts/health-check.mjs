#!/usr/bin/env node
/**
 * Daily repository health check for Ripple.
 *
 * Runs the core quality gates (typecheck, lint, test, build, doctor and a
 * fixture analysis), writes a deterministic health.json, and exits non-zero
 * when anything fails. The scheduled workflow commits health.json to the
 * unprotected `health` branch only when the result changes.
 *
 *   node scripts/health-check.mjs
 *   node scripts/health-check.mjs --output health.json --markdown health.md
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;

const CHECK_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_LOG_LINES = 60;
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const HELP = `Usage: node scripts/health-check.mjs [options]

Options:
  -o, --output <path>    Write the deterministic report (default: health.json)
  -m, --markdown <path>  Also write a human-readable summary
  -h, --help             Show this help
`;

function parseArgs(argv) {
  const options = { output: "health.json", markdown: "" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-o" || arg === "--output") {
      const value = argv[index + 1];
      if (!value) {
        console.error("--output needs a path");
        process.exit(2);
      }
      options.output = value;
      index += 1;
    } else if (arg === "-m" || arg === "--markdown") {
      const value = argv[index + 1];
      if (!value) {
        console.error("--markdown needs a path");
        process.exit(2);
      }
      options.markdown = value;
      index += 1;
    } else if (arg === "-h" || arg === "--help") {
      console.log(HELP);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}\n`);
      console.error(HELP);
      process.exit(2);
    }
  }

  return options;
}

function execute(command) {
  const result = spawnSync(command, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
    timeout: CHECK_TIMEOUT_MS,
    windowsHide: true,
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (result.error) console.error(result.error.message);

  return {
    error: result.error,
    exitCode: result.status ?? 1,
    output: [stdout, stderr].filter(Boolean).join("\n"),
    stdout,
  };
}

function tail(text, limit = MAX_LOG_LINES) {
  const lines = text.replace(ANSI_ESCAPE, "").replace(/\r\n/g, "\n").trimEnd().split("\n");
  return lines.slice(-limit).join("\n");
}

function validateBuiltVersion() {
  const execution = execute("node dist/bin.js version");
  if (execution.exitCode !== 0) {
    throw new Error("node dist/bin.js version failed after the build");
  }

  const printed = execution.stdout.trim().split("\n").pop()?.trim() ?? "";
  if (printed !== version) {
    throw new Error(`dist/bin.js reports "${printed || "no version"}", expected ${version}`);
  }
}

function validateAnalyze(execution) {
  const report = JSON.parse(execution.stdout);

  if (report.tool !== "ripple" || report.command !== "analyze") {
    throw new Error("analyze did not return a Ripple analyze report");
  }
  if (typeof report.risk?.score !== "number" || typeof report.risk?.level !== "string") {
    throw new Error("analyze report is missing risk.score or risk.level");
  }
  if (typeof report.summary?.affectedFiles !== "number") {
    throw new Error("analyze report is missing summary.affectedFiles");
  }
}

const checks = [
  { name: "typecheck", command: "pnpm run typecheck" },
  { name: "lint", command: "pnpm run lint" },
  { name: "test", command: "pnpm run test" },
  { name: "build", command: "pnpm run build", validate: validateBuiltVersion },
  { name: "doctor", command: "node dist/bin.js doctor" },
  {
    name: "analyze",
    command: "node dist/bin.js analyze tests/fixtures/basic/src/authentication/login.ts --json",
    validate: validateAnalyze,
  },
];

function runChecks() {
  const results = [];

  for (const check of checks) {
    console.log(`\n> ${check.name}\n  ${check.command}\n`);
    const started = Date.now();
    const execution = execute(check.command);
    const durationMs = Date.now() - started;
    let status = execution.exitCode === 0 ? "pass" : "fail";
    let detail = "";

    if (status === "pass" && check.validate) {
      try {
        check.validate(execution);
      } catch (error) {
        status = "fail";
        detail = error instanceof Error ? error.message : String(error);
        console.error(`  ${detail}`);
      }
    }

    if (status === "fail" && !detail) {
      detail = execution.error?.message ?? `exit code ${execution.exitCode}`;
    }

    results.push({
      name: check.name,
      status,
      detail,
      durationMs,
      log: tail(execution.output),
    });

    console.log(`  ${status === "pass" ? "PASS" : "FAIL"} ${check.name} (${durationMs}ms)`);
  }

  return results;
}

function codeFence(text) {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

function renderMarkdown(status, results) {
  const lines = [
    `# Ripple health: ${status}`,
    "",
    `Version: \`${version}\``,
    "",
    "| Check | Result |",
    "| --- | --- |",
    ...results.map(
      (result) => `| ${result.name} | ${result.status === "pass" ? "✅ pass" : "❌ fail"} |`,
    ),
    "",
  ];

  for (const result of results) {
    if (result.status === "pass") continue;

    lines.push(`## ${result.name}`, "");
    if (result.detail) lines.push(result.detail, "");
    if (result.log) {
      const fence = codeFence(result.log);
      lines.push(
        "<details><summary>Last output</summary>",
        "",
        `${fence}text`,
        result.log,
        fence,
        "",
        "</details>",
        "",
      );
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

const options = parseArgs(process.argv.slice(2));
console.log(`Ripple health check — v${version}\n`);

const results = runChecks();
const failed = results.filter((result) => result.status === "fail");
const status = failed.length === 0 ? "healthy" : "unhealthy";

const report = {
  schemaVersion: 1,
  status,
  version,
  checks: results.map(({ name, status: checkStatus }) => ({ name, status: checkStatus })),
};

const outputPath = path.resolve(repoRoot, options.output);
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nWrote ${path.relative(repoRoot, outputPath)}`);

if (options.markdown) {
  const markdownPath = path.resolve(repoRoot, options.markdown);
  writeFileSync(markdownPath, renderMarkdown(status, results));
  console.log(`Wrote ${path.relative(repoRoot, markdownPath)}`);
}

console.log(`\nRipple health: ${status} (v${version})`);
for (const result of results) {
  console.log(`  ${result.status === "pass" ? "PASS" : "FAIL"} ${result.name}`);
}

process.exitCode = status === "healthy" ? 0 : 1;
