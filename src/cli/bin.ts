import { TerminalWriter } from "../output/writer.js";
import { run } from "./program.js";
import pkg from "../../package.json" with { type: "json" };

/**
 * Real CLI entry point. Keep this file thin — all logic lives in
 * `src/cli/program.ts` so the program stays integration-testable.
 */

const ctx = {
  writer: new TerminalWriter(),
  errorWriter: new TerminalWriter(process.stderr),
  cwd: process.cwd(),
  version: pkg.version,
};

const exitCode = await run({ argv: process.argv, ctx });
process.exitCode = exitCode;
