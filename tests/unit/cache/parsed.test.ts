import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTsProject } from "../../../src/parser/ts-project.js";
import {
  CACHE_FILE,
  configCacheHash,
  contentHash,
  loadParsedCache,
  loadParsedFiles,
  saveParsedCache,
} from "../../../src/cache/parsed.js";
import type { RippleConfig } from "../../../src/types/config.js";
import { basicFixture } from "../../helpers/fixtures.js";

const project = createTsProject();

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function minimalConfig(overrides: Partial<RippleConfig> = {}): RippleConfig {
  return {
    include: ["**/*.{ts,tsx,js,jsx}"],
    ignore: ["node_modules", "dist"],
    aliases: {},
    tsconfigPath: "tsconfig.json",
    risk: {
      weights: {
        affectedFiles: 0.3,
        entryPoint: 0.15,
        sharedUtility: 0.15,
        publicExports: 0.1,
        tests: 0.1,
        routes: 0.1,
        cycleMembership: 0.1,
      },
      thresholds: { medium: 30, high: 55, critical: 80 },
    },
    diff: { gate: "high", allow: [] },
    ...overrides,
  };
}

/** Copy the fixture's src tree into a temp project root. */
function fixtureRoot(prefix: string): string {
  const root = tempDir(prefix);
  fs.cpSync(path.join(basicFixture, "src"), path.join(root, "src"), { recursive: true });
  return root;
}

function fixturePaths(root: string): string[] {
  return fs
    .readdirSync(path.join(root, "src"), { recursive: true })
    .filter((name) => typeof name === "string" && /\.(ts|tsx|js|jsx)$/.test(name))
    .map((name) => path.join(root, "src", name as string))
    .sort((a, b) => a.localeCompare(b));
}

describe("cache location and hashing", () => {
  it("stores the cache under .ripple/cache in the project root", () => {
    expect(CACHE_FILE).toBe(path.join(".ripple", "cache", "parsed-v1.json"));
  });

  it("hashes file content deterministically", async () => {
    const a = await contentHash(path.join(basicFixture, "src", "main.ts"));
    const b = await contentHash(path.join(basicFixture, "src", "main.ts"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("config hash is stable across key order and ignores non-discovery fields", () => {
    const base = minimalConfig();
    const shuffled = minimalConfig({
      include: ["**/*.{ts,tsx,js,jsx}"],
      ignore: ["dist", "node_modules"],
      risk: { ...base.risk, thresholds: { medium: 1, high: 2, critical: 3 } },
      diff: { gate: "critical", allow: ["x/**"] },
    });
    expect(configCacheHash(base)).toBe(configCacheHash(shuffled));
  });

  it("config hash changes when discovery changes", () => {
    const base = minimalConfig();
    const changed = minimalConfig({ include: ["src/**/*.ts"] });
    expect(configCacheHash(base)).not.toBe(configCacheHash(changed));
  });
});

describe("loadParsedCache / saveParsedCache", () => {
  it("returns an empty map when no cache exists", async () => {
    const root = tempDir("ripple-cache-none-");
    expect(await loadParsedCache(root, "abc")).toEqual(new Map());
  });

  it("round-trips entries", async () => {
    const root = fixtureRoot("ripple-cache-roundtrip-");
    const entries = new Map([
      [
        "src/main.ts",
        {
          hash: "h1",
          parsed: {
            path: "src/main.ts",
            kind: "ts" as const,
            imports: [],
            exports: { named: [], hasDefault: false, reExportedFrom: [], reExportedAll: [] },
            symbols: {
              functions: ["main"],
              classes: [],
              interfaces: [],
              enums: [],
              typeAliases: [],
            },
          },
        },
      ],
    ]);
    await saveParsedCache(root, "cfg", entries);
    const loaded = await loadParsedCache(root, "cfg");
    expect(loaded.size).toBe(1);
    expect(loaded.get("src/main.ts")?.hash).toBe("h1");
    expect(loaded.get("src/main.ts")?.parsed.symbols.functions).toEqual(["main"]);
  });

  it("ignores a cache written for a different config hash", async () => {
    const root = fixtureRoot("ripple-cache-config-");
    await saveParsedCache(
      root,
      "old-cfg",
      new Map([
        [
          "src/main.ts",
          {
            hash: "h",
            parsed: {
              path: "src/main.ts",
              kind: "ts" as const,
              imports: [],
              exports: { named: [], hasDefault: false, reExportedFrom: [], reExportedAll: [] },
              symbols: { functions: [], classes: [], interfaces: [], enums: [], typeAliases: [] },
            },
          },
        ],
      ]),
    );
    expect(await loadParsedCache(root, "new-cfg")).toEqual(new Map());
  });

  it("ignores a corrupt cache file", async () => {
    const root = tempDir("ripple-cache-corrupt-");
    fs.mkdirSync(path.join(root, ".ripple", "cache"), { recursive: true });
    fs.writeFileSync(path.join(root, CACHE_FILE), "{not json", "utf8");
    expect(await loadParsedCache(root, "cfg")).toEqual(new Map());
  });

  it("ignores a cache with an unknown schema version", async () => {
    const root = tempDir("ripple-cache-schema-");
    fs.mkdirSync(path.join(root, ".ripple", "cache"), { recursive: true });
    fs.writeFileSync(
      path.join(root, CACHE_FILE),
      JSON.stringify({ schema: 999, configHash: "cfg", files: {} }),
      "utf8",
    );
    expect(await loadParsedCache(root, "cfg")).toEqual(new Map());
  });
});

describe("loadParsedFiles", () => {
  it("parses everything on a cold run and serves hits on the next", async () => {
    const root = fixtureRoot("ripple-cache-cold-");
    const filePaths = fixturePaths(root);
    const config = minimalConfig();

    const cold = await loadParsedFiles({ project, rootDir: root, filePaths, config });
    expect(cold.stats.hits).toBe(0);
    expect(cold.stats.misses).toBe(filePaths.length);
    expect(cold.parsedFiles).toHaveLength(filePaths.length);
    expect(cold.parsedFiles[0]!.path).toBe(filePaths[0]);
    expect(
      cold.parsedFiles.every(
        (p) =>
          (Array.isArray(p.imports) && p.parseError === undefined) || p.parseError !== undefined,
      ),
    ).toBe(true);
    expect(cold.parsedFiles.some((p) => p.imports.length > 0)).toBe(true);

    const warm = await loadParsedFiles({ project, rootDir: root, filePaths, config });
    expect(warm.stats.hits).toBe(filePaths.length);
    expect(warm.stats.misses).toBe(0);
    expect(warm.parsedFiles).toEqual(cold.parsedFiles);
  });

  it("re-parses only the file whose content changed", async () => {
    const root = fixtureRoot("ripple-cache-stale-");
    const filePaths = fixturePaths(root);
    const config = minimalConfig();
    await loadParsedFiles({ project, rootDir: root, filePaths, config });

    const changed = path.join(root, "src", "main.ts");
    fs.writeFileSync(
      changed,
      'import { Button } from "./components/Button";\n\nexport default Button;\n',
      "utf8",
    );
    const mainIdx = filePaths.findIndex((p) => p.endsWith("main.ts"));
    const warm = await loadParsedFiles({ project, rootDir: root, filePaths, config });
    expect(warm.stats.hits).toBe(filePaths.length - 1);
    expect(warm.stats.misses).toBe(1);
    expect(warm.parsedFiles[mainIdx]!.exports.hasDefault).toBe(true);
    expect(warm.parsedFiles[mainIdx]!.imports.map((i) => i.raw)).toContain("./components/Button");
  });

  it("caches parse errors and keeps surfaces stable", async () => {
    const root = fixtureRoot("ripple-cache-error-");
    fs.writeFileSync(
      path.join(root, "src", "broken.ts"),
      "import { from broken syntax ((\n",
      "utf8",
    );
    const filePaths = fixturePaths(root);
    const config = minimalConfig();

    const cold = await loadParsedFiles({ project, rootDir: root, filePaths, config });
    const broken = cold.parsedFiles.find((p) => p.path.endsWith("broken.ts"));
    expect(broken?.parseError).toBeTruthy();

    const warm = await loadParsedFiles({ project, rootDir: root, filePaths, config });
    const brokenWarm = warm.parsedFiles.find((p) => p.path.endsWith("broken.ts"));
    expect(brokenWarm?.parseError).toBe(broken?.parseError);
  });

  it("keeps output order aligned with filePaths after a mixed run", async () => {
    const root = fixtureRoot("ripple-cache-order-");
    const filePaths = fixturePaths(root);
    const config = minimalConfig();
    await loadParsedFiles({ project, rootDir: root, filePaths, config });
    fs.writeFileSync(path.join(root, "src", "new.ts"), "export const x = 1;\n", "utf8");
    const reordered = [...filePaths].reverse();
    const warm = await loadParsedFiles({ project, rootDir: root, filePaths: reordered, config });
    expect(warm.parsedFiles.map((p) => p.path)).toEqual(reordered);
  });

  it("is invalidated by a config change", async () => {
    const root = fixtureRoot("ripple-cache-invalidate-");
    const filePaths = fixturePaths(root);
    const config = minimalConfig();
    await loadParsedFiles({ project, rootDir: root, filePaths, config });
    const warm = await loadParsedFiles({
      project,
      rootDir: root,
      filePaths,
      config: minimalConfig({ include: ["src/**/*.ts"] }),
    });
    expect(warm.stats.hits).toBe(0);
    expect(warm.stats.misses).toBe(filePaths.length);
  });

  it("respects RIPPLE_NO_CACHE to force a cold run", async () => {
    const root = fixtureRoot("ripple-cache-nocache-");
    const filePaths = fixturePaths(root);
    const config = minimalConfig();
    await loadParsedFiles({ project, rootDir: root, filePaths, config });

    const previous = process.env.RIPPLE_NO_CACHE;
    process.env.RIPPLE_NO_CACHE = "1";
    try {
      const forced = await loadParsedFiles({ project, rootDir: root, filePaths, config });
      expect(forced.stats.hits).toBe(0);
      expect(forced.stats.misses).toBe(filePaths.length);
    } finally {
      if (previous === undefined) delete process.env.RIPPLE_NO_CACHE;
      else process.env.RIPPLE_NO_CACHE = previous;
    }
  });
});
