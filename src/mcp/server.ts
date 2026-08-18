/**
 * Minimal Model Context Protocol server core (JSON-RPC 2.0 over stdio,
 * newline-delimited messages).
 *
 * Implements just what Ripple needs: `initialize`, `ping`,
 * `tools/list`, `tools/call` and the `notifications/initialized` lifecycle
 * notification. Everything else surfaces as a standard JSON-RPC error so
 * clients degrade gracefully instead of hanging.
 *
 * The core is transport-agnostic: `handleLine` takes one inbound message and
 * returns the response to write (or `null` for notifications), which makes it
 * unit-testable without spawning processes.
 */

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema draft-07 object describing `arguments`. */
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<McpToolResult> | McpToolResult;
}

export interface McpToolResult {
  /** Markdown or JSON text returned to the client. */
  text: string;
  /** Marks the result as an error while keeping the server alive. */
  isError?: boolean;
}

export interface McpServerOptions {
  name: string;
  version: string;
  tools: McpTool[];
}

const PROTOCOL_VERSION = "2025-06-18";

const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_INTERNAL = -32603;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class McpServer {
  private readonly options: McpServerOptions;
  private readonly tools = new Map<string, McpTool>();

  constructor(options: McpServerOptions) {
    this.options = options;
    for (const tool of options.tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * Process one inbound message. Returns the JSON-RPC response line to write
   * back, or `null` for notifications and invalid requests.
   */
  async handleLine(line: string): Promise<string | null> {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return this.response(undefined, {
        code: ERR_PARSE,
        message: "Parse error: not valid JSON",
      });
    }

    if (!isObject(message) || message.jsonrpc !== "2.0") {
      return this.response(undefined, {
        code: ERR_INVALID_REQUEST,
        message: "Invalid Request: expected a JSON-RPC 2.0 object",
      });
    }

    const hasId = "id" in message;
    if (message.method === "notifications/initialized") {
      return null;
    }

    if (!hasId) {
      return null;
    }

    const method = message.method;
    if (typeof method !== "string") {
      return this.response(message.id, {
        code: ERR_INVALID_REQUEST,
        message: "Invalid Request: method must be a string",
      });
    }

    try {
      const result = await this.dispatch(method, message.params);
      return this.response(message.id, result);
    } catch (error) {
      return this.response(message.id, {
        code: ERR_INTERNAL,
        message: error instanceof Error ? error.message : "Internal error",
      });
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: this.protocolVersion(params),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: this.options.name, version: this.options.version },
        };
      case "ping":
        return {};
      case "tools/list":
        return {
          tools: [...this.tools.values()].map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        };
      case "tools/call":
        return this.callTool(params);
      case "tools/list_changed":
        throw new Error("Tool list changes are not supported by this server");
      default:
        throw new Error(`Method not found: ${method}`);
    }
  }

  private protocolVersion(params: unknown): string {
    if (isObject(params) && typeof params.protocolVersion === "string") {
      return params.protocolVersion;
    }
    return PROTOCOL_VERSION;
  }

  private async callTool(params: unknown): Promise<unknown> {
    if (!isObject(params) || typeof params.name !== "string") {
      throw new Error("Invalid params: expected { name: string, arguments?: object }");
    }
    const tool = this.tools.get(params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${params.name}`);
    }

    const args =
      isObject(params.arguments) || params.arguments === undefined
        ? (params.arguments ?? {})
        : null;
    if (args === null) {
      throw new Error(`Invalid arguments for tool ${params.name}: expected an object`);
    }

    try {
      const result = await tool.handler(args);
      return {
        content: [{ type: "text", text: result.text }],
        ...(result.isError ? { isError: true } : {}),
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Tool failed",
          },
        ],
        isError: true,
      };
    }
  }

  private response(id: unknown, payload: { code: number; message: string } | unknown): string {
    if (
      typeof payload === "object" &&
      payload !== null &&
      "code" in payload &&
      typeof payload.code === "number"
    ) {
      const errorPayload = payload as Record<string, unknown>;
      const error = { code: errorPayload.code, message: String(errorPayload.message) };
      return `${JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error })}\n`;
    }
    return `${JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result: payload })}\n`;
  }
}
