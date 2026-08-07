import { ExitCode } from "../types/cli.js";

/**
 * Error type surfaced to the CLI entry point. Carries an exit code and an
 * optional hint that explains how to recover.
 */
export class RippleError extends Error {
  readonly exitCode: ExitCode;
  readonly hint?: string;

  constructor(message: string, exitCode: ExitCode = ExitCode.Failure, hint?: string) {
    super(message);
    this.name = "RippleError";
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

/** Thrown when a file passed to `ripple analyze` cannot be found. */
export function fileNotFound(filePath: string): RippleError {
  return new RippleError(
    `File not found: ${filePath}`,
    ExitCode.NotFound,
    "Run `ripple graph` to list the files Ripple can analyze.",
  );
}
