/**
 * GBrain Sources 单元测试
 *
 * 覆盖范围：
 * - sources.yml 可被解析为合法 GBrainSource 列表
 * - listSyncable 过滤掉 syncMode=excluded 的源
 * - InMemoryGBrainClient.search 按 sourceId 过滤、按权重排序、topK 生效
 * - syncSource 对 excluded 源返回 0
 * - 非法 sourceId 抛错
 * - 空 query 返回空结果
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findSource,
  listSyncable,
  loadSources,
} from "./sources.js";
import { InMemoryGBrainClient } from "./in-memory-client.js";

function makeFakeRepo() {
  const root = mkdtempSync(join(tmpdir(), "opsagent-gbrain-"));
  const arch = join(root, "docs/architecture");
  const knowledge = join(root, "docs/knowledge");
  const archive = join(root, "docs/archive");
  mkdirSync(arch, { recursive: true });
  mkdirSync(knowledge, { recursive: true });
  mkdirSync(archive, { recursive: true });
  writeFileSync(
    join(arch, "overview.md"),
    "# Architecture Overview\n\nOpsAgent 是一个 AI Ops 演示项目。指标查询使用 PromQL。\n",
  );
  writeFileSync(
    join(knowledge, "prometheus-basics.md"),
    "# Prometheus 基础\n\nPromQL 是查询语言。\n",
  );
  writeFileSync(
    join(archive, "old-design.md"),
    "# 已废弃草案\n\n此文件不应被检索。\n",
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
  - id: opsagent-archive
    path: docs/archive/
    description: 归档
    searchWeight: 0
    syncMode: excluded
`,
  );
  return { root, sourcesYml };
}

describe("GBrain sources.yml 解析", () => {
  test("合法 yaml 解析为 GBrainSource 列表", () => {
    const { sourcesYml } = makeFakeRepo();
    const sources = loadSources(sourcesYml);
    assert.equal(sources.length, 3, "应解析出 3 条 source");
    assert.equal(
      sources[0]?.id,
      "opsagent-architecture",
      "第一条应为 architecture",
    );
    assert.equal(
      sources[2]?.syncMode,
      "excluded",
      "archive 应为 excluded",
    );
  });

  test("listSyncable 过滤掉 excluded 源", () => {
    const { sourcesYml } = makeFakeRepo();
    const sources = loadSources(sourcesYml);
    const syncable = listSyncable(sources);
    assert.equal(syncable.length, 2, "应仅保留 2 条可同步源");
    assert.equal(
      syncable.every((s) => s.syncMode !== "excluded"),
      true,
      "不应包含 excluded",
    );
  });

  test("findSource 按 id 查找", () => {
    const { sourcesYml } = makeFakeRepo();
    const sources = loadSources(sourcesYml);
    const found = findSource(sources, "opsagent-knowledge");
    assert.equal(found?.description, "知识", "应找到 knowledge 源");
    assert.equal(
      findSource(sources, "nonexistent"),
      undefined,
      "不存在的 id 应返回 undefined",
    );
  });
});

describe("InMemoryGBrainClient", () => {
  test("search 返回带 sourceId 的结果并按权重排序", async () => {
    const { root, sourcesYml } = makeFakeRepo();
    const client = new InMemoryGBrainClient({
      sourcesPath: sourcesYml,
      repoRoot: root,
    });
    const results = await client.search({ query: "PromQL" });
    assert.ok(results.length >= 1, "应至少有 1 条命中");
    assert.equal(
      results[0]?.sourceId,
      "opsagent-architecture",
      "高权重源应排在前",
    );
  });

  test("search 按 sourceId 过滤", async () => {
    const { root, sourcesYml } = makeFakeRepo();
    const client = new InMemoryGBrainClient({
      sourcesPath: sourcesYml,
      repoRoot: root,
    });
    const results = await client.search({
      query: "查询语言",
      sourceId: "opsagent-architecture",
    });
    assert.equal(results.length, 0, "架构目录不含 '查询语言' 应返回空");
  });

  test("search topK 截断", async () => {
    const { root, sourcesYml } = makeFakeRepo();
    const client = new InMemoryGBrainClient({
      sourcesPath: sourcesYml,
      repoRoot: root,
    });
    const results = await client.search({ query: "OpsAgent", topK: 1 });
    assert.ok(results.length <= 1, "topK=1 时最多 1 条");
  });

  test("search 空 query 返回空结果", async () => {
    const { root, sourcesYml } = makeFakeRepo();
    const client = new InMemoryGBrainClient({
      sourcesPath: sourcesYml,
      repoRoot: root,
    });
    const results = await client.search({ query: "" });
    assert.deepEqual(results, [], "空 query 应返回空数组");
  });

  test("excluded 源不会被检索", async () => {
    const { root, sourcesYml } = makeFakeRepo();
    const client = new InMemoryGBrainClient({
      sourcesPath: sourcesYml,
      repoRoot: root,
    });
    const results = await client.search({ query: "已废弃草案" });
    assert.equal(results.length, 0, "archive 目录不应被检索");
  });

  test("syncSource excluded 源返回 0", async () => {
    const { root, sourcesYml } = makeFakeRepo();
    const client = new InMemoryGBrainClient({
      sourcesPath: sourcesYml,
      repoRoot: root,
    });
    const result = await client.syncSource("opsagent-archive");
    assert.equal(result.synced, 0, "excluded 源同步应返回 0");
  });

  test("非法 sourceId 抛错", async () => {
    const { root, sourcesYml } = makeFakeRepo();
    const client = new InMemoryGBrainClient({
      sourcesPath: sourcesYml,
      repoRoot: root,
    });
    await assert.rejects(
      () => client.syncSource("not-a-source"),
      /unknown GBrain source/,
      "非法 sourceId 应抛错",
    );
  });
});
