#!/usr/bin/env node
/**
 * Synthetic benchmark generator and runner for Ripple.
 *
 * Generates layered TypeScript projects (core -> shared -> domain ->
 * features -> app) with a seeded PRNG so every run is reproducible, then
 * measures cold vs warm analysis against the built `dist` binary:
 *
 *   node scripts/bench.mjs            # default matrix (200..2000 files)
 *   node scripts/bench.mjs --files 500 # single size
 *   node scripts/bench.mjs --repeats 5 # more repeats (default 3)
 *
 * Numbers are machine-local; run `pnpm build` first so timings reflect the
 * real bundle, not the jiti dev loader.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distBin = path.join(repoRoot, "dist", "bin.js");
const workDir = path.join(repoRoot, ".bench");

const LAYERS = [
  { name: "core", share: 0.25 },
  { name: "shared", share: 0.15 },
  { name: "domain", share: 0.25 },
  { name: "features", share: 0.25 },
  { name: "app", share: 0.1 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLayers(count) {
  const layers = LAYERS.map((layer) => ({ ...layer, files: [] }));
  let remaining = count;
  for (let i = 0; i < LAYERS.length; i++) {
    const layer = LAYERS[i];
    const n = i === LAYERS.length - 1 ? remaining : Math.round(count * layer.share);
    for (let j = 0; j < n; j++) {
      layers[i].files.push({ name: `${layer.name}/m${String(j).padStart(4, "0")}.ts` });
    }
    remaining -= n;
  }
  return layers;
}

function generate(dir, count) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(dir, "ripple.config.json"),
    JSON.stringify({ include: ["src/**/*.ts"] }, null, 2),
  );

  const rand = mulberry32(42);
  const layers = buildLayers(count);
  const byName = new Map();
  for (const layer of layers) {
    mkdirSync(path.join(dir, "src", layer.name), { recursive: true });
    for (const file of layer.files) byName.set(file.name, file);
  }

  const pick = (pool, k) => {
    const picked = [];
    const copy = [...pool];
    for (let i = 0; i < k && copy.length > 0; i++) {
      picked.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
    }
    return picked;
  };

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    for (const file of layer.files) {
      const deps = i === 0 ? [] : pick(layers[i - 1].files, 2 + Math.floor(rand() * 2));
      const exports = [];
      const fromDir = path.dirname(file.name);
      const imports = deps.map((dep, k) => {
        const symbol = `dep${k}`;
        exports.push(`${symbol}${k}`);
        const rel = path.relative(fromDir, dep.name).replace(/\\/g, "/");
        return `import { ${symbol}${k} } from "./${rel.replace(/\.ts$/, "")}";`;
      });
      const lines = [
        ...imports,
        ...exports.map((symbol, k) => `export const ${symbol}${k} = ${k + 1};`),
        `export const value${file.name.replace(/\W/g, "")} = ${Math.floor(rand() * 1000)};`,
      ];
      writeFileSync(path.join(dir, "src", file.name), `${lines.join("\n")}\n`);
    }
  }

  const appFiles = layers[layers.length - 1].files.map((file) => file.name);
  const entryImports = appFiles
    .map((name, k) => `import { dep0${k} } from "./${name.replace(/\.ts$/, "")}";`)
    .join("\n");
  writeFileSync(path.join(dir, "src", "index.ts"), `${entryImports}\nexport const app = 1;\n`);
}

function runOnce(cwd, args, cold) {
  const env = { ...process.env, NO_COLOR: "1" };
  if (cold) env.RIPPLE_NO_CACHE = "1";
  const started = performance.now();
  const out = execFileSync(process.execPath, [distBin, ...args], {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { ms: Math.round(performance.now() - started), out };
}

function digestWithoutDuration(out) {
  const doc = JSON.parse(out);
  delete doc.durationMs;
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex").slice(0, 12);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const args = process.argv.slice(2);
const filesFlag = args.indexOf("--files");
const sizes = filesFlag >= 0 ? [Number(args[filesFlag + 1])] : [200, 500, 1000, 2000];
const repeatsFlag = args.indexOf("--repeats");
const REPEATS = repeatsFlag >= 0 ? Number(args[repeatsFlag + 1]) : 3;
const keep = args.includes("--keep");

if (!existsSync(distBin)) {
  console.error("dist/bin.js not found — run `pnpm build` first.");
  process.exit(1);
}

console.log(`Benchmarking ${distBin} — sizes: ${sizes.join(", ")} — repeats: ${REPEATS}\n`);
console.log("size | command | cold (ms) | warm (ms) | speedup | deterministic");

for (const size of sizes) {
  const dir = path.join(workDir, `proj-${size}`);
  generate(dir, size);

  for (const [command, label] of [
    [["graph", "--json"], "graph"],
    [["analyze", "src/features/m0000.ts", "--json"], "analyze"],
  ]) {
    const coldRuns = [];
    const warmRuns = [];
    let deterministic = true;
    let referenceHash = "";
    for (let r = 0; r < REPEATS; r++) {
      const cold = runOnce(dir, command, true);
      coldRuns.push(cold.ms);
      const coldHash = digestWithoutDuration(cold.out);
      const warm = runOnce(dir, command, false);
      warmRuns.push(warm.ms);
      const warmHash = digestWithoutDuration(warm.out);
      if (r === 0) referenceHash = coldHash;
      if (coldHash !== referenceHash || warmHash !== referenceHash) deterministic = false;
    }
    const coldMs = median(coldRuns);
    const warmMs = median(warmRuns);
    const speedup = (coldMs / Math.max(warmMs, 1)).toFixed(2);
    console.log(
      `${String(size).padEnd(4)} | ${label.padEnd(9)} | ${String(coldMs).padStart(6)} | ${String(warmMs).padStart(6)} | ${speedup}x | ${deterministic ? "yes" : "NO"}`,
    );
  }
}

if (!keep) {
  rmSync(workDir, { recursive: true, force: true });
}
