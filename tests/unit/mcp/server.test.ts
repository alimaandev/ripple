import { describe, expect, it } from "vitest";
import { McpServer } from "../../../src/mcp/server.js";
import type { McpTool } from "../../../src/mcp/server.js";

const echoTool: McpTool = {
  name: "echo",
  description: "Echo a message",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  handler: (args) => ({ text: `echo: ${String(args.text)}` }),
};

const boomTool: McpTool = {
  name: "boom",
  description: "Always fails",
  inputSchema: { type: "object" },
  handler: () => {
    throw new Error("boom exploded");
  },
};

function server(): McpServer {
  return new McpServer({
    name: "ripple",
    version: "0.7.0",
    tools: [echoTool, boomTool],
  });
}

function parse(line: string | null): Record<string, unknown> | null {
  return line ? (JSON.parse(line) as Record<string, unknown>) : null;
}

describe("McpServer protocol", () => {
  it("answers initialize with server info and tool capability", async () => {
    const response = parse(
      await server().handleLine(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test" } },
        }),
      ),
    );
    expect(response!.id).toBe(1);
    expect(response!.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ripple", version: "0.7.0" },
    });
  });

  it("answers ping with an empty result", async () => {
    const response = parse(
      await server().handleLine(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" })),
    );
    expect(response!.result).toEqual({});
  });

  it("lists tools with name, description and input schema", async () => {
    const response = parse(
      await server().handleLine(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })),
    );
    const tools = (response!.result as { tools: Array<Record<string, unknown>> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(["echo", "boom"]);
    expect(tools[0]).toMatchObject({
      description: "Echo a message",
      inputSchema: { type: "object" },
    });
  });

  it("calls a tool and returns its text content", async () => {
    const response = parse(
      await server().handleLine(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "echo", arguments: { text: "hi" } },
        }),
      ),
    );
    expect(response!.result).toEqual({
      content: [{ type: "text", text: "echo: hi" }],
    });
  });

  it("returns a tool failure as isError without killing the session", async () => {
    const mcp = server();
    const failure = parse(
      await mcp.handleLine(
        JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "boom" } }),
      ),
    );
    expect((failure!.result as { isError: boolean }).isError).toBe(true);
    const next = parse(
      await mcp.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping" })),
    );
    expect(next!.result).toEqual({});
  });

  it("rejects an unknown tool with a JSON-RPC error", async () => {
    const response = parse(
      await server().handleLine(
        JSON.stringify({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope" } }),
      ),
    );
    expect(response!.error).toMatchObject({ code: -32603 });
    expect((response!.error as { message: string }).message).toContain("Unknown tool");
  });

  it("responds with a JSON-RPC error for unknown methods", async () => {
    const response = parse(
      await server().handleLine(
        JSON.stringify({ jsonrpc: "2.0", id: 8, method: "resources/list" }),
      ),
    );
    expect(response!.error).toMatchObject({ code: -32603 });
  });

  it("responds with a parse error for invalid JSON", async () => {
    const response = parse(await server().handleLine("not json"));
    expect(response!.error).toMatchObject({ code: -32700 });
  });

  it("responds with an invalid request error for malformed messages", async () => {
    const response = parse(await server().handleLine(JSON.stringify({ hello: "world" })));
    expect(response!.error).toMatchObject({ code: -32600 });
  });

  it("ignores notifications and the initialized notification", async () => {
    const mcp = server();
    expect(
      await mcp.handleLine(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })),
    ).toBeNull();
    expect(
      await mcp.handleLine(
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: {} }),
      ),
    ).toBeNull();
  });
});
