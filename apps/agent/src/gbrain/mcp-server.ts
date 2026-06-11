import { callTool, listTools, type ToolCallResult } from "./mcp-tools.js";
import type { GBrainClient } from "./types.js";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class GBrainMcpServer {
  constructor(private readonly client: GBrainClient) {}

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const id = request.id ?? null;
    try {
      switch (request.method) {
        case "initialize":
          return {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: {
                name: "opsagent-gbrain",
                version: "0.1.0",
              },
            },
          };
        case "tools/list":
          return {
            jsonrpc: "2.0",
            id,
            result: { tools: listTools() },
          };
        case "tools/call": {
          const params = (request.params ?? {}) as {
            name?: string;
            arguments?: unknown;
          };
          if (typeof params.name !== "string") {
            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: -32602,
                message: "tools/call requires params.name",
              },
            };
          }
          const result: ToolCallResult = await callTool(
            this.client,
            params.name,
            params.arguments,
          );
          return { jsonrpc: "2.0", id, result };
        }
        default:
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `method not found: ${request.method}`,
            },
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message },
      };
    }
  }
}
