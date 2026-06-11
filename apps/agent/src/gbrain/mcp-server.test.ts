/**
 * GBrain MCP Server 单元测试
 *
 * 覆盖范围：
 * - initialize：返回 serverInfo + capabilities.tools
 * - tools/list：返回 search_knowledge
 * - tools/call search_knowledge：返回带 sourceId 的 snippets
 * - tools/call 未知 tool：返回 isError
 * - tools/call 非法参数：zod 拦截并返回 isError
 * - tools/call 空结果：返回 "no results"
 * - 未知 method：返回 method not found 错误
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryGBrainClient } from "./in-memory-client.js";
import {
  GBrainMcpServer,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./mcp-server.js";

function makeFakeRepo() {
  const root = mkdtempSync(join(tmpdir(), "opsagent-gbrain-mcp-"));
  const arch = join(root, "docs/architecture");
  const knowledge = join(root, "docs/knowledge");
  mkdirSync(arch, { recursive: true });
  mkdirSync(knowledge, { recursive: true });
  writeFileSync(
    join(arch, "overview.md"),
    "# Architecture Overview\n\nOpsAgent 使用 Prometheus 查询指标。\n",
  );
  writeFileSync(
    join(knowledge, "prometheus.md"),
    "# Prometheus 基础\n\nPromQL 是查询语言。\n",
  );
  const sourcesYml = join(root, "sources.yml");
  writeFileSync(
    sourcesYml,
    `sources:
  - id: opsagent-architecture
    path: docs/architecture/
    description: 架构
    searchWeight: 1.0
    syncMode: on_demand
  - id: opsagent-knowledge
    path: docs/knowledge/
    description: 知识
    searchWeight: 0.5
    syncMode: on_demand
`,
  );
  return { root, sourcesYml };
}

function buildServer() {
  const { root, sourcesYml } = makeFakeRepo();
  const client = new InMemoryGBrainClient({
    sourcesPath: sourcesYml,
    repoRoot: root,
  });
  return new GBrainMcpServer(client);
}

async function call(
  server: GBrainMcpServer,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  return server.handle(req);
}

describe("GBrain MCP Server — initialize / tools/list", () => {
  test("initialize 返回 serverInfo 与 capabilities.tools", async () => {
    const server = buildServer();
    const res = await call(server, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    });
    assert.equal(res.jsonrpc, "2.0", "jsonrpc 应为 2.0");
    assert.equal(res.id, 1, "id 应回显");
    const result = res.result as {
      serverInfo?: { name: string };
      capabilities?: { tools?: unknown };
    };
    assert.equal(
      result.serverInfo?.name,
      "opsagent-gbrain",
      "serverInfo.name 应为 opsagent-gbrain",
    );
    assert.ok(result.capabilities?.tools, "capabilities.tools 应存在");
  });

  test("tools/list 返回 search_knowledge", async () => {
    const server = buildServer();
    const res = await call(server, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    const result = res.result as { tools: Array<{ name: string }> };
    assert.equal(result.tools.length, 1, "应只暴露 1 个工具");
    assert.equal(
      result.tools[0]?.name,
      "search_knowledge",
      "tool 名应为 search_knowledge",
    );
  });
});

describe("GBrain MCP Server — tools/call search_knowledge", () => {
  test("合法参数返回带 sourceId 的 snippets", async () => {
    const server = buildServer();
    const res = await call(server, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "search_knowledge",
        arguments: { query: "Prometheus" },
      },
    });
    assert.equal(res.error, undefined, "不应有 error");
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
    };
    assert.equal(result.content[0]?.type, "text", "content.type 应为 text");
    const text = result.content[0]?.text ?? "";
    assert.ok(text.includes("sourceId:"), "应包含 sourceId 标注");
    assert.ok(text.includes("opsagent-architecture"), "应命中架构源");
  });

  test("sourceId 过滤生效", async () => {
    const server = buildServer();
    const res = await call(server, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "search_knowledge",
        arguments: {
          query: "Prometheus",
          sourceId: "opsagent-knowledge",
        },
      },
    });
    const text = ((res.result as {
      content: Array<{ text: string }>;
    }).content[0]?.text ?? "");
    assert.ok(
      !text.includes("opsagent-architecture"),
      "不应命中 architecture 源",
    );
    assert.ok(text.includes("opsagent-knowledge"), "应命中 knowledge 源");
  });

  test("空结果返回 'no results'", async () => {
    const server = buildServer();
    const res = await call(server, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "search_knowledge",
        arguments: { query: "nonexistent term xyz" },
      },
    });
    const text = ((res.result as {
      content: Array<{ text: string }>;
    }).content[0]?.text ?? "");
    assert.equal(text, "no results", "无命中应返回 'no results'");
  });

  test("未知 tool 返回 isError", async () => {
    const server = buildServer();
    const res = await call(server, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "do_something_else", arguments: {} },
    });
    const result = res.result as { isError?: boolean };
    assert.equal(result.isError, true, "未知 tool 应标记 isError");
  });

  test("非法参数被 zod 拦截", async () => {
    const server = buildServer();
    const res = await call(server, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "search_knowledge", arguments: { query: "" } },
    });
    const result = res.result as { isError?: boolean; content: Array<{ text: string }> };
    assert.equal(result.isError, true, "空 query 应标记 isError");
    assert.ok(
      result.content[0]?.text.includes("invalid arguments"),
      "应提示 invalid arguments",
    );
  });

  test("缺少 params.name 返回 -32602", async () => {
    const server = buildServer();
    const res = await call(server, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { arguments: { query: "x" } },
    });
    assert.equal(res.error?.code, -32602, "缺少 name 应为 -32602");
  });
});

describe("GBrain MCP Server — 未知 method", () => {
  test("返回 method not found (-32601)", async () => {
    const server = buildServer();
    const res = await call(server, {
      jsonrpc: "2.0",
      id: 9,
      method: "resources/read",
    });
    assert.equal(res.error?.code, -32601, "未知 method 应为 -32601");
    assert.ok(
      res.error?.message.includes("method not found"),
      "message 应包含 'method not found'",
    );
  });
});
