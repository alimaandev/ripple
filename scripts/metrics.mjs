#!/usr/bin/env node
/**
 * Weekly launch-metrics snapshot for Ripple.
 *
 * Fetches GitHub repo stats (via `gh`), npm weekly downloads, and the
 * companion action repo's popularity, then appends one row per run to
 * METRICS.md (rerunning on the same day updates that day's row).
 *
 *   node scripts/metrics.mjs        # snapshot and write METRICS.md
 *   node scripts/metrics.mjs --json # print raw numbers, skip the file write
 *
 * Requires the GitHub CLI to be authenticated. Targets are tracked in
 * METRICS.md: 1K stars, 10K weekly downloads, 100 action installs,
 * 5 contributors, Product Hunt top-5, HN front page.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const metricsFile = path.join(repoRoot, "METRICS.md");
const PACKAGE = "@alimaandev/ripple";
const REPO = "alimaandev/ripple";
const ACTION_REPO = "alimaandev/ripple-action";

function gh(args) {
  return JSON.parse(
    execFileSync("gh", ["api", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
}

async function snapshot() {
  const repo = gh([
    "--jq",
    "{stars:.stargazers_count,forks:.forks_count,openIssues:.open_issues_count}",
    `repos/${REPO}`,
  ]);
  const contributors = gh([
    "--paginate",
    "--jq",
    "[.[].login] | length",
    `repos/${REPO}/contributors?per_page=100&anon=false`,
  ]);
  const openIssues = gh([
    "--paginate",
    "--jq",
    "[.[] | select(.pull_request == null)] | length",
    `repos/${REPO}/issues?state=open&per_page=100`,
  ]);
  const action = gh([
    "--jq",
    "{stars:.stargazers_count,forks:.forks_count}",
    `repos/${ACTION_REPO}`,
  ]);
  const downloads = await fetch(`https://api.npmjs.org/downloads/point/last-week/${PACKAGE}`)
    .then((r) => r.json())
    .then((d) => d.downloads ?? 0);

  return {
    date: new Date().toISOString().slice(0, 10),
    stars: repo.stars,
    forks: repo.forks,
    contributors,
    openIssues,
    downloads,
    actionStars: action.stars,
    actionForks: action.forks,
  };
}

const HEADER = `# Launch metrics

Tracked weekly with \`pnpm run metrics\`. Targets: **1K stars**, **10K weekly downloads**,
**100 action installs** (proxied by the action repo's stars/forks), **5 contributors**,
Product Hunt top-5, HN front page.

| Date | Stars | Forks | Contributors | Open issues | npm weekly downloads | Action stars | Action forks | Notes |
|---|---|---|---|---|---|---|---|---|
`;

function writeMetrics(entry, note = "") {
  let rows = [];
  if (existsSync(metricsFile)) {
    rows = readFileSync(metricsFile, "utf8")
      .split("\n")
      .filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l));
  }
  const existing = rows.findIndex((l) => l.startsWith(`| ${entry.date} |`));
  const row = `| ${entry.date} | ${entry.stars} | ${entry.forks} | ${entry.contributors} | ${entry.openIssues} | ${entry.downloads} | ${entry.actionStars} | ${entry.actionForks} | ${note} |`;
  if (existing >= 0) rows[existing] = row;
  else rows.push(row);
  writeFileSync(metricsFile, `${HEADER}\n${rows.join("\n")}\n`);
}

const entry = await snapshot();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(entry, null, 2));
} else {
  writeMetrics(
    entry,
    process.argv.includes("--note") ? (process.argv[process.argv.indexOf("--note") + 1] ?? "") : "",
  );
  console.log(`\n  date        ${entry.date}`);
  console.log(`  stars       ${entry.stars}`);
  console.log(`  forks       ${entry.forks}`);
  console.log(`  contributors ${entry.contributors}`);
  console.log(`  open issues ${entry.openIssues}`);
  console.log(`  weekly dl   ${entry.downloads}`);
  console.log(`  action stars ${entry.actionStars}`);
  console.log(`  action forks ${entry.actionForks}`);
  console.log(`\n  wrote ${path.relative(repoRoot, metricsFile)}\n`);
}
