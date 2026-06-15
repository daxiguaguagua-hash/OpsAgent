# M3-12 注册 GBrain Sources

日期：2026-06-11
状态：`done`（提交 `ce039c5`）
前置任务：M3-11
负责人：ai-agent-team

## 1. 目标

将 M3-11 整理后的文档目录注册为 GBrain 的多个独立数据源，使每个目录可以独立同步、独立查询，并在检索结果中保留"来源目录"标签。

## 2. 数据源划分

| Source ID | 目录 | 同步频率 |
|---|---|---|
| `opsagent-architecture` | `docs/architecture/` | 按需 |
| `opsagent-decisions` | `docs/decisions/` | 按需 |
| `opsagent-knowledge` | `docs/knowledge/` | 按需 |
| `opsagent-workflows` | `docs/workflows/` | 按需 |
| `opsagent-devlog` | `docs/devlog/` | 每周（低优先级） |

## 3. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/gbrain/sources.yml` | 数据源声明 |
| `apps/agent/gbrain/sync.ts` | 同步命令实现 |
| `apps/agent/gbrain/sync.test.ts` | 覆盖同步与来源追踪 |

## 4. 验收标准

| 验收项 | 标准 |
|---|---|
| 独立同步 | 修改 `docs/architecture/` 后只同步该 source，不影响其他 |
| 来源标签 | 检索结果包含 `sourceId` 字段 |
| 同步命令 | `pnpm --filter @opsagent/agent gbrain:sync` 可执行 |

## 5. 不做的事（边界）

- 不做向量索引重建优化（pgvector 默认重建）。
- 不做跨 source 去重。
