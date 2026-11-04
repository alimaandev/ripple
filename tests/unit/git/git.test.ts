import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedFiles, resolveBase } from "../../../src/git/changed.js";

/**
 * Git integration tests against scratch repositories. Skipped when `git`
 * is not available on the runner.
 */

let dir = "";

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Evaluated at module load: `describe.skip` cannot depend on `beforeAll`.
const gitBinary = hasGit();

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Create a fresh repository with a committed baseline. */
function newRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ripple-git-"));
  git(["init", "-b", "main"], repo);
  git(["config", "user.email", "test@ripple.dev"], repo);
  git(["config", "user.name", "Ripple Test"], repo);
  return repo;
}

beforeAll(() => {
  if (!gitBinary) return;
  dir = newRepo();
  fs.writeFileSync(path.join(dir, "seed.ts"), "export const seed = 1;\n");
  git(["add", "."], dir);
  git(["commit", "-m", "seed"], dir);
});

afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const describeGit = gitBinary ? describe : describe.skip;

describeGit("resolveBase", () => {
  it("accepts an explicit existing ref", () => {
    expect(resolveBase(dir, "main")).toBe("main");
  });

  it("falls back through defaults", () => {
    expect(resolveBase(dir)).toBe("main");
  });

  it("throws for a missing ref", () => {
    expect(() => resolveBase(dir, "does-not-exist")).toThrow(/Git ref not found/);
  });
});

describeGit("changedFiles", () => {
  it("lists tracked changes and untracked files", () => {
    const repo = newRepo();
    fs.writeFileSync(path.join(repo, "a.txt"), "hello\n");
    git(["add", "."], repo);
    git(["commit", "-m", "baseline"], repo);

    fs.writeFileSync(path.join(repo, "a.txt"), "changed\n");
    fs.writeFileSync(path.join(repo, "c.txt"), "export const x = 1\n");

    const changed = changedFiles(repo, "main");
    expect(changed.baseLabel).toBe("main");
    expect(changed.repoRoot.toLowerCase()).toBe(path.resolve(repo).toLowerCase());
    expect(changed.files).toEqual(["a.txt", "c.txt"]);
  });

  it("resolves repo-root paths when run from a package subdirectory", () => {
    const repo = newRepo();
    const packageDir = path.join(repo, "packages", "app");
    fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(packageDir, "src", "a.ts"), "export const a = 1;\n");
    git(["add", "."], repo);
    git(["commit", "-m", "baseline"], repo);

    fs.writeFileSync(path.join(packageDir, "src", "a.ts"), "export const a = 2;\n");
    fs.writeFileSync(path.join(packageDir, "src", "new.ts"), "export const n = 1;\n");

    const changed = changedFiles(packageDir, "main");
    // Git reports paths relative to the repository root, never the cwd.
    expect(changed.files).toEqual(["packages/app/src/a.ts", "packages/app/src/new.ts"]);
    expect(path.resolve(changed.repoRoot, changed.files[0]!).toLowerCase()).toBe(
      path.join(packageDir, "src", "a.ts").toLowerCase(),
    );
  });

  it("ignores Ripple cache artifacts", () => {
    const repo = newRepo();
    fs.writeFileSync(path.join(repo, "a.txt"), "baseline\n");
    git(["add", "."], repo);
    git(["commit", "-m", "baseline"], repo);

    fs.mkdirSync(path.join(repo, ".ripple", "cache"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".ripple", "cache", "parsed-v3.json"), '{"schema":3}\n');
    fs.mkdirSync(path.join(repo, "packages", "app", ".ripple", "cache"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "packages", "app", ".ripple", "cache", "parsed-v3.json"),
      '{"schema":3}\n',
    );
    fs.writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");

    const changed = changedFiles(repo, "main");
    expect(changed.files).toEqual(["a.ts"]);
  });

  it("omits deleted files from the change set", () => {
    const repo = newRepo();
    fs.writeFileSync(path.join(repo, "old.ts"), "export const gone = 1;\n");
    git(["add", "."], repo);
    git(["commit", "-m", "baseline"], repo);
    fs.unlinkSync(path.join(repo, "old.ts"));

    const changed = changedFiles(repo, "main");
    expect(changed.files).toEqual([]);
  });

  it("reports an empty set on a clean tree", () => {
    const repo = newRepo();
    fs.writeFileSync(path.join(repo, "keep.ts"), "export const k = 1;\n");
    git(["add", "."], repo);
    git(["commit", "-m", "baseline"], repo);

    expect(changedFiles(repo, "main").files).toEqual([]);
  });
});
