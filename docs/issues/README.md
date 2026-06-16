# 任务卡索引（已迁移）

> **注意**：所有里程碑任务卡已迁移到 `docs/milestones/M{N}/tasks/`。本目录保留作为兼容入口。

## 新位置

| 里程碑 | 任务卡位置 | 里程碑验收 |
|---|---|---|
| M0 | [[M0/tasks/|docs/milestones/M0/tasks/]] | [[M0/milestone-acceptance|M0-milestone-acceptance.md]] |
| M1 | [[M1/tasks/|docs/milestones/M1/tasks/]] | [[M1/milestone-acceptance|M1-milestone-acceptance.md]] |
| M2 | [[M2/tasks/|docs/milestones/M2/tasks/]] | [[M2/milestone-acceptance|M2-milestone-acceptance.md]] |
| M3 | [[M3/tasks/|docs/milestones/M3/tasks/]] | （M3 验收文档待补） |
| M4 | [[M4/tasks/|docs/milestones/M4/tasks/]] | （M4 进行中；M4-04 / M4-09 / M4-11 已建卡，M4-01/02/03 为 Phase A 历史待补） |

总览与正式拆分见 [[task-breakdown|task-breakdown.md]]。

## 历史说明

本目录曾是 OpsAgent v0.1 各里程碑任务卡的唯一落盘位置。批次 3.3 迁移后，所有任务卡移到对应里程碑目录，便于按里程碑浏览。

旧的命名规则 `<Milestone>-<编号>-<slug>.md` 在新位置保留。

## 卡片状态约定

详见 [[AGENTS|AGENTS.md]] 的"任务卡片管理纪律"节，包含：

- 卡片顶部元数据块格式（日期 / 状态 / 前置任务 / 负责人）
- 状态取值（`planned` / `implementing` / `testing` / `ready_for_review` / `done` / `accepted`）
- 三点同步纪律（单卡更新 / 索引同步 / task-breakdown.md 同步）
- 与 workflow-gates 状态机的区分
