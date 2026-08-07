import type { OutputWriter } from "../types/cli.js";

/**
 * Output writers. The CLI writes to stdout (or an injected stream); tests
 * use the in-memory implementation.
 */

export class TerminalWriter implements OutputWriter {
  constructor(private readonly stream: NodeJS.WritableStream = process.stdout) {}

  write(text: string): void {
    this.stream.write(text);
  }

  writeLine(text = ""): void {
    this.stream.write(`${text}\n`);
  }
}

export class InMemoryWriter implements OutputWriter {
  readonly chunks: string[] = [];

  write(text: string): void {
    this.chunks.push(text);
  }

  writeLine(text = ""): void {
    this.chunks.push(`${text}\n`);
  }

  /** Full captured output. */
  get output(): string {
    return this.chunks.join("");
  }

  /** Captured output split into lines (trailing newline removed). */
  get lines(): string[] {
    return this.output.replace(/\n$/, "").split("\n");
  }
}
