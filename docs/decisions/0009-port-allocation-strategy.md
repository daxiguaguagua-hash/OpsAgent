# ADR-0009: 服务端口分配采用"注册表 + 反向代理"双层策略

- **日期**：2026-06-16
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[0001-env-layer-design|ADR-0001]]：env 层是唯一数据源，端口变量应纳入同一治理框架
  - [[0007-glitchtip-as-sentry-fallback|ADR-0007]]：GlitchTip 默认 8000 端口与本项 backend `PORT` 默认值冲突，是本决策的直接触发点
  - [[0002-error-tracking-strategy|ADR-0002]]：可观测性栈（Prometheus/Loki/Tempo）端口数量激增，放大了治理需求

## Context

随着 M4 引入 GlitchTip、可观测性栈（Prometheus 9090、Loki 3100、Tempo 3200、Grafana 3000）以及后续可能的更多旁路服务，端口资源出现两类问题：

1. **冲突**：`packages/env/src/index.ts` 的 `PORT` 默认值为 `8000`，与 GlitchTip 官方镜像默认 `8000` 撞车，开发期 `pnpm dev` 和 `docker compose up` 无法并存。
2. **散乱**：端口字面量散落在 `docker-compose.yml`、`vite.config.ts`、`apps/backend`、`packages/env` 等多处，没有"全项目端口一览表"，新人 onboard 容易踩坑。
3. **扩展性**：M4 之后还可能有 Playwright/MinIO/Mailhog 等开发工具，每次都靠拍脑袋选端口，迟早再撞。

需要一条能同时解决"冲突 / 散乱 / 扩展"的策略，且与 ADR-0001 的"env 做唯一数据源"原则保持一致。

## Decision

采用 **端口注册表 + 反向代理** 双层策略，分阶段落地：

### 第一层（必做，短期）：端口注册表

- 在根 `.env.example` 新增 `## Port Registry` 段落，集中声明所有服务端口变量：

  ```bash
  ## ── Port Registry ──────────────────────────────────────────
  BACKEND_PORT=8000
  FRONTEND_PORT=3001
  GLITCHTIP_PORT=8001
  GRAFANA_PORT=3000
  PROMETHEUS_PORT=9090
  LOKI_PORT=3100
  TEMPO_PORT=3200
  REDIS_PORT=6379
  POSTGRES_PORT=5432
  ```

- `packages/env/src/index.ts` 的 `PORT: z.coerce.number().int().positive().default(8000)` 改为读取 `BACKEND_PORT`，`PORT` 作为别名保留以避免破坏既有调用方。
- `docker-compose.yml` 各服务的 `ports:` 段改用变量引用（`"8001:${GLITCHTIP_PORT:-8001}"`）。
- `vite.config.ts` 的 `server.port` 改用 `FRONTEND_PORT`。
- 在 `docs/packages/env.md`（或新建 `docs/port-registry.md`）维护端口一览表，包含服务名、变量名、默认值、用途说明。

### 第二层（推荐，中期）：反向代理统一入口

- 在 docker-compose 中引入 **Traefik** 作为反向代理（label-based 服务发现，零配置接入新服务）。
- 对外只暴露 80/443（`http://opsagent.local` 等），各服务改用内部端口（不暴露到 host），彻底消除 host 层端口冲突。
- 可观测性栈（Grafana/Prometheus/Loki/Tempo）优先迁移到 Traefik 后端，作为 M4 收尾的一部分。

### 第三层（保留场景）：动态端口（`port: 0`）

- **仅用于测试/CI**：`pnpm test` 并行启动多套 backend 时，由 `get-port` 或 Node 内建 `server.listen(0)` 动态分配。
- **不用于开发/生产**：开发期端口漂移会破坏 CORS、前端代理、开发者记忆；生产期端口漂移会让服务发现/监控标签都乱掉。

**未被采纳的方案**：

- **方案 B：Consul/etcd 服务发现**。放弃原因：OpsAgent 是单机/小集群 monorepo，服务发现层成本远高于收益；Traefik 的 label-based 发现已足够。
- **方案 C：完全放弃端口注册表，全靠 Traefik**。放弃原因：开发期部分服务（如 `pnpm dev` 跑的 backend/frontend）不走 docker-compose，仍需要显式端口变量。

## Consequences

### 正面

- **冲突可见化**：所有端口集中在 `.env.example` 里，一眼能看出哪些端口被占用，新人 onboard 不再踩坑。
- **与 ADR-0001 一致**：端口变量通过 `@opsagent/env` schema 统一管理，不会散落到业务代码的字面量里。
- **扩展友好**：新增服务只需在注册表追加一行 + 在 docker-compose 加 label（如启用 Traefik）。
- **渐进式落地**：第一层一周内可完成，第二层随 M4 可观测性收尾一起做，不阻塞当前进度。

### 负面

- **注册表维护成本**：每次新增服务需要同步更新 `.env.example`、`docker-compose.yml`、端口文档三处。可通过脚本（`scripts/check-port-registry.ts`）做 CI 校验缓解。
- **Traefik 引入学习曲线**：团队需要理解 label-based 路由、middleware、TLS 配置，初期会有调试成本。

### 风险

- **端口号进入 env 后，`env.PORT` 的语义漂移**：原本 `PORT` 表示"backend 端口"，改名 `BACKEND_PORT` 后调用方需要迁移。需要 grep 全仓 `env.PORT`，做一次性迁移（或保留别名一两个里程碑）。
- **Traefik 与现有 Caddy/Nginx 共存期**：如果未来生产环境仍用其他反向代理，会出现两套路由配置。需要在 M5 之前明确"生产入口是什么"，避免双轨。

## 反向引用

暂无（首次落地，待后续文档引用时回填）。

## 实施记录（2026-06-16 最小落地）

首次落地集中在"解决 GlitchTip 与 backend 的 8000 端口冲突"，未做完整注册表聚合：

| 改动 | 文件 | 说明 |
|---|---|---|
| GlitchTip host 端口 `8000:8000` → `8001:8000` | `docker-compose.yml` | 容器内仍是 8000（GlitchTip 官方默认），host 让位给 backend |
| `GLITCHTIP_DOMAIN` 默认值 → `http://localhost:8001` | `docker-compose.yml` | 与 host 端口对齐，邮件/UI 链接不再指向错误端口 |
| 每个 app 加"端口注册表"注释块 + nginx 最佳实践提示 | `apps/backend/.env[.example]`、`apps/frontend/.env[.example]`、`apps/agent/.env[.example]` | 按用户要求"端口注册表写在模块 env，不写根目录 env" |
| 所有 GlitchTip URL（DSN / SENTRY_URL / SENTRY_API_ENDPOINT）端口 8000 → 8001 | 各 app `.env` + 根 `.env` + 根 `.env.example` | backend 占 8000 后 GlitchTip 必须同步切 8001 |
| README "快速开始" §7 §10 端口说明更新 | `README.md` | GlitchTip 入口改为 8001，Grafana 单独列出 3000 |

**未做（留给后续里程碑）**：

- 中央 schema 里 `PORT` → `BACKEND_PORT` 的别名迁移（需 grep 全仓 `env.PORT`，风险面较大）
- docker-compose 其它服务的 host 端口变量化（3000/3100/3200/9090/4318 暂无冲突，先不动）
- Traefik 反向代理的引入（M5+ 再做，当前开发期规模还不需要）
