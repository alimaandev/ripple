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

let gitBinary = false;
let dir = "";

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
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    gitBinary = true;
  } catch {
    return;
  }
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
    expect(changed.files).toEqual(["a.txt", "c.txt"]);
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
