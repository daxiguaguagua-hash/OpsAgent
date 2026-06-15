# M4 规划讨论文档

日期：2026-06-14
状态：`planning`
里程碑目标：Sentry + Source Map 前端源码定位

---

## 1. M4 目标

从 Demo 清单的闭环来看：

```
故障发生 → 观测数据 → AI Agent → 源码级定位 → 修复建议 → 人类审核
```

M0-M3 完成了前半段（故障 → 观测 → Agent → 后端源码定位）。
M4 补完**前端源码定位**——让 Agent 能把浏览器里压缩 JS 的报错行列号，还原到 React/TSX 源码文件和行号。

## 1.5 三层错误监控策略（面试核心叙事）

M4 采用三层递进方案，面试时从上往下讲，展示"会用工具 → 懂成本优化 → 理解底层原理"：

```
第一层（行业标准）：Sentry SaaS — @sentry/react 一行初始化，生产环境标配
第二层（成本优化）：GlitchTip   — 兼容 Sentry 协议的开源平替，中小企业私有化部署
第三层（底层原理）：自研 SDK    — 从 PerformanceObserver 到 Source Map 反解全链路手写
```

### 方案对比

| 维度 | Sentry SaaS | GlitchTip 自建 | 自研 Browser SDK |
|---|---|---|---|
| 内存需求 | 8+ GB（自建版）/ 0（SaaS） | **~512 MB** | 0（纯前端） |
| 容器数 | 15-20（自建版） | **3 个** | 0 |
| Sentry SDK 兼容 | 原生 | ✅ 兼容 | ❌ 自建协议 |
| Source Map 反解 | 自动 | ✅ 支持 | 手写 `source-map` 库 |
| 面试定位 | "我们用 Sentry" | "中小企业用不起 Sentry？还有 GlitchTip" | "我自己写了一个，讲清楚原理" |
| 开源协议 | BSL（有限制） | **MIT** | 自有代码 |

### Sentry 自建评估（不可行）

当前电脑 Docker 资源：
- 总内存：7.75 GiB
- 已用：~1.3 GiB（9 个容器，16.9%）
- 剩余：~6.4 GiB
- Sentry 自建最低要求：8 GiB（推荐 16 GiB）+ 15-20 个容器（Kafka/ClickHouse/Snuba/Relay...）

**结论：带不动。用 SaaS 或 GlitchTip。**

### Sentry SaaS 限制

- 免费试用 14 天，之后需要付费
- 可以走完整个流程（错误采集 → Source Map 上传 → 堆栈还原 → Agent 分析）
- 面试现场如果需要长期 demo，需要 GlitchTip 兜底

### GlitchTip 详细评估

**架构**：Django + PostgreSQL + Redis（3 个 Docker 容器，~512 MB）
**Sentry SDK 兼容**：前端用 `@sentry/react`，只改 DSN 指向 GlitchTip：

```typescript
Sentry.init({
  dsn: "http://your-glitchtip-key@localhost:8000/1",
  // 和 Sentry SaaS 完全一样的初始化代码，前端零改动
});
```

**面试表达**：
> 生产环境用 Sentry SaaS。但如果客户是中小企业，数据不能出境外，
> 用不起 Sentry 自建版（需要 Kafka + ClickHouse），我会推荐 GlitchTip。
> 它兼容 Sentry 协议，前端代码零改动，只需改 DSN。
> Docker 512 MB 就跑起来了，比 Sentry 自建版轻了 16 倍。

### 自研 Browser SDK 详细评估

**项目地址**：https://github.com/daxiguaguagua-hash/nodejs-and-frontend-performance-optimization

**已有能力**（`packages/browser-sdk/`）：

| 模块 | 文件 | 能力 |
|---|---|---|
| 采集层 | `metrics/collectors.ts` | Navigation Timing（DNS/TCP/TTFB/DOM）、Resource Timing、Paint（FP/FCP） |
| Web Vitals | `metrics/web-vitals.ts` | LCP（含终值判断）、INP（最差交互）、CLS（累积布局偏移） |
| 传输层 | `transport/sender.ts` | 内存 buffer + `sendBeacon` + 定时 flush + 页面卸载 flush |
| 入口 | `index.ts` | `initPerf()` 一键初始化，返回 `stop()` 清理函数 |
| 服务端 | `apps/server/` | Hono BFF，`POST /v1/metrics` 接收上报数据 |

**M4 需要补的能力**：

| 模块 | 说明 | 对应 M4 卡片 |
|---|---|---|
| `error-collector.ts` | `window.onerror` + `unhandledrejection` 捕获 | M4-03 自研版 |
| `breadcrumbs.ts` | 用户操作轨迹（点击、路由变更、HTTP 请求） | M4-05 自研版 |
| `sourcemap-uploader` | 构建时上传 `.map` 到服务端 | M4-04 自研版 |
| `symbolication API` | 服务端用 `source-map` 库反解堆栈 | M4-07 |

**面试表达**：
> 除了用 Sentry，我还从底层写了一个浏览器性能监控 SDK。
> 采集层用 PerformanceObserver 订阅 Navigation/Resource/Paint/Web Vitals，
> 传输层用 sendBeacon 保证页面卸载时数据不丢失，
> 服务端用 source-map 库做 Source Map 反解，把压缩后的行号还原到源码位置。
> 这个项目帮我理解了 Sentry 底层到底在做什么。

**教学项目结构**（Day01-Day08 课程）：

```
course/
├── day01-memory/       ← Node.js 内存泄漏（全局数组/闭包/定时器）
├── day02-stress-test/  ← 压力测试
├── day03-leak-tools/   ← 泄漏检测工具
├── day04-event-emitter/← EventEmitter 内存泄漏
├── day05-buffer-stream/← Buffer 和 Stream
├── day06-hono-middleware/← BFF 中间件实战（洋葱模型）
├── day07-frontend-perf-principles/← 前端性能原理
└── day08-web-vitals/   ← Web Vitals 实现
```

## 2. 现有卡片（来自 task-breakdown.md §8）

| ID | 任务 | 负责人 | 优先级 | 交付物 |
|---|---|---|---:|---|
| M4-01 | 前端生产构建生成 Source Map | frontend-team | P1 | build 配置 |
| M4-02 | Source Map 不公开暴露 | frontend-team | P1 | 部署说明 |
| M4-03 | 接入 Sentry 前端 SDK | frontend-team | P0 | Sentry 初始化与错误边界 |
| M4-04 | Release + 私有 Source Map 上传 | frontend-team + sre-team | P0 | 构建与上传脚本 |
| M4-05 | Breadcrumbs + 环境上下文 | frontend-team | P1 | Issue 包含操作轨迹 |
| M4-06 | MinIO 私有存储 | sre-team | P1 | MinIO Compose 服务 |
| M4-07 | 简化 symbolication 反解 API | backend-team | P1 | 压缩 JS 行列号 → 源码位置 |
| M4-08 | 对比 Sentry vs 自研反解 | docs-team | P1 | 架构与安全说明 |
| M4-09 | Agent 结合源码给建议 | ai-agent-team | P1 | 报告包含源码文件、行号、建议 |
| M4-10 | 前端 OTel Web SDK | frontend-team | P1 | 浏览器→后端完整 trace |

## 3. 需要讨论的决策点

### 3.1 三层方案的分工与切换机制

已确定采用三层递进方案（详见 §1.5），各方案在 M4 中的分工：

| 方案 | M4 落地方式 | 优先级 |
|---|---|---|
| **Sentry SaaS** | M4-03 接入 `@sentry/react`，M4-04 Source Map 上传到 Sentry | P0（先跑通） |
| **GlitchTip** | Docker Compose 加 3 个容器，前端 DSN 切换即可，代码零改动 | P1（兜底方案） |
| **自研 SDK** | 在现有 browser-sdk 上补 error-collector + symbolication | P1（教学演示） |

Sentry 自建版已评估为不可行（需要 8+ GB 内存 + 15-20 个容器）。

**环境变量切换机制**：通过 `ERROR_TRACKING_PROVIDER` 环境变量在三个方案间切换，前端代码零改动：

```typescript
// apps/frontend/src/lib/sentry.ts
const provider = import.meta.env.VITE_ERROR_TRACKING_PROVIDER ?? "sentry";

const DSN_MAP = {
  sentry: import.meta.env.VITE_SENTRY_DSN,          // Sentry SaaS
  glitchtip: import.meta.env.VITE_GLITCHTIP_DSN,    // GlitchTip 自建
  custom: "",                                        // 自研 SDK（不走 Sentry）
} as const;

if (provider !== "custom" && DSN_MAP[provider]) {
  Sentry.init({ dsn: DSN_MAP[provider], ... });
}
```

```env
# .env 示例
# 方案一：Sentry 云端版（开发/面试演示）
ERROR_TRACKING_PROVIDER=sentry
VITE_SENTRY_DSN=https://xxx@o0.ingest.sentry.io/0

# 方案二：GlitchTip 私有化（中小企业场景）
ERROR_TRACKING_PROVIDER=glitchtip
VITE_GLITCHTIP_DSN=http://xxx@localhost:8000/1

# 方案三：自研 SDK（教学演示，不走 Sentry 协议）
ERROR_TRACKING_PROVIDER=custom
```

**执行顺序**：先用 Sentry SaaS 跑通完整流程，再切换 DSN 验证 GlitchTip 兼容性。

**上传工具决策**：最终采用 `@sentry/vite-plugin`（不是 `sentry-cli`），Release 命名策略待定。详见 [[0006-sentry-release-sourcemap-strategy|ADR-0006]]（M4-04 实施依据）。

**Sentry CLI 状态**：已安装 `@sentry/cli` v3.5.0（npx），需要执行 `npx @sentry/cli login` 完成认证。

### 3.2 MinIO 是否必要？

**已决定：不需要。** Sentry 和 GlitchTip 都自带 Source Map 存储能力，M4 不需要额外的 S3 存储。

| 方案 | Source Map 存储 |
|---|---|
| Sentry SaaS | Source Map 直接上传到 Sentry（`@sentry/vite-plugin` 或 `sentry-cli`） |
| GlitchTip | 兼容 Sentry 上传协议，Source Map 存到 GlitchTip 的 PostgreSQL |
| 自研 symbolication | 可以存本地 `dist/maps/` 目录，不需要 MinIO |

**M4-06（MinIO）标记为 `cancelled`。** 如果后续有"企业私有化 S3 存储"的独立需求，再评估。

### 3.3 M4-07 自研 symbolication 的定位

M4-07（简化 symbolication 反解 API）和 M4-03/04（Sentry）有功能重叠：
- Sentry 自动做 symbolication（上传 Source Map 后，Sentry 自动还原堆栈）
- M4-07 是自己用 `source-map` 库手写反解

**两种定位**：
1. **教学向**：M4-07 用来面试时讲 Source Map 底层原理，Sentry 用来展示生产方案
2. **独立方案**：M4-07 作为 Sentry 的替代方案，适合不想依赖 SaaS 的场景

**倾向**：教学向。面试时先展示 Sentry 自动还原，再打开 M4-07 代码讲底层原理。

### 3.4 M4-10 前端 OTel Web SDK 的优先级

这张卡和 Sentry 有功能重叠：
- Sentry 有 Performance Monitoring（性能监控）和 Session Replay
- OTel Web SDK 做的是浏览器 fetch → 后端的端到端 trace

**讨论**：
- 如果 Sentry 已经能展示前端性能数据，M4-10 的增量价值是"Tempo 里看到完整前端→后端 trace"
- 工作量不小：Web SDK 初始化 + span propagation + CORS + baggage headers
- 可以推迟到 M6

### 3.5 M4-09 Agent 结合源码——复用 M3 analysis pipeline

今天的 analysis pipeline 已经打通了 DeepSeek + tools 的完整链路。M4-09 只需：

1. 新增 `sentry-tool`：调 Sentry API 拿最近的 error event（包含 stacktrace + breadcrumbs）
2. 新增 `source-map-tool`（可选）：如果 Sentry 已经做了 symbolication，这个 tool 只需拿到还原后的源码位置
3. 更新 Agent instructions：加一段"分析前端错误时，先查 Sentry event，拿到源码位置后用 git-context 工具查近期变更"

```typescript
// 新增 tool 伪代码
const sentryTool = createTool({
  id: "sentry",
  description: "查询 Sentry 最近的 error event（stacktrace、breadcrumbs、环境信息）",
  inputSchema: z.object({
    issueId: z.string().optional(),
    projectId: z.string().optional(),
    limit: z.number().default(5),
  }),
  execute: async ({ issueId, projectId, limit }) => {
    // 调 Sentry API: GET /api/0/projects/{org}/{project}/events/
  },
});
```

### 3.6 Sentry vs Grafana：重合还是互补？

**结论：有少量重合，但更多是互补。两者解决不同层面的问题。**

| 维度 | Grafana + Prometheus + Loki + Tempo | Sentry |
|---|---|---|
| **核心定位** | 基础设施 & 服务级可观测性 | 应用级错误追踪 & 调试 |
| **回答的问题** | "系统健康吗？哪个服务慢了？" | "代码哪一行报错了？为什么？" |
| 错误监控 | Loki 看 ERROR 日志文本 | 完整堆栈 + 源码行号 + 局部变量 + breadcrumbs |
| 指标 | Prometheus 强项（rate/histogram/SLO） | 有但弱（`Sentry.metrics` 是辅助） |
| 链路追踪 | Tempo 存储 + Grafana 展示 | Sentry tracing（自动 instrument） |
| 日志 | Loki 强项（LogQL 查询） | log capturing 是附属功能 |
| **Source Map 反解** | ❌ 做不了 | ✅ 核心能力 |
| **错误分组/去重** | ❌ 没有 | ✅ 自动按堆栈指纹分组 |
| **Release 关联** | ❌ 没有 | ✅ 哪个版本引入的 bug |
| **Breadcrumbs** | ❌ 没有 | ✅ 用户操作轨迹 |
| 告警 | Alertmanager（成熟） | Sentry Alert（基于 error 频率） |
| Dashboard | Grafana 强项（自由组合） | Sentry Dashboard（面向开发者） |

**重合的部分**：

| 重合点 | 谁更强 |
|---|---|
| 分布式追踪 | Tempo（存储更久、查询更灵活）vs Sentry（自动 instrument 更省事） |
| 性能监控 | Prometheus + Grafana（自定义指标 + SLO）vs Sentry（开箱即用但不够灵活） |
| 告警 | Alertmanager（规则引擎更成熟）vs Sentry（错误频率告警更直观） |

**在 OpsAgent 中的分工**：

```
┌─────────────────────────────────────────────────────────┐
│                    开发者视角（Sentry）                    │
│                                                         │
│  "POST /api/orders 报错了"                               │
│  → 堆栈：TypeError: Cannot read 'total' of null          │
│  → 文件：Checkout.tsx:137                                │
│  → Release：v1.2.3 引入                                  │
│  → 用户操作：点击了"下单"按钮                              │
│  → 影响用户数：42 人                                      │
└─────────────────────┬───────────────────────────────────┘
                      │ 关联
┌─────────────────────▼───────────────────────────────────┐
│                   SRE 视角（Grafana）                     │
│                                                         │
│  "POST /api/orders 错误率 3.2%，超过 SLO 1%"             │
│  → P99 延迟 450ms（正常）                                 │
│  → Loki 日志：DEMO_FORCED_FAILURE                         │
│  → Tempo trace：span 树显示 0ms 直接返回                  │
│  → Prometheus：http_requests_total{status="500"} 上升    │
└─────────────────────────────────────────────────────────┘
```

**数据互通彩蛋**：Grafana 有 [Sentry 数据源插件](https://grafana.com/grafana/plugins/grafana-sentry-datasource/)，可以在 Grafana Dashboard 里直接查询 Sentry 的 error 数据。两个系统的数据不是信息孤岛。

**Sentry 也支持 Node.js 后端**：`@sentry/node` 有 Hono 官方集成（Context7 验证），M4 可以同时接前后端，实现浏览器 fetch → Hono 路由 → PostgreSQL 查询的端到端 distributed trace。

**面试表达**：
> 我们的可观测性分两层。Grafana + Prometheus + Loki + Tempo 负责基础设施层面，
> 回答"系统是否健康、哪个服务出了问题"。Sentry 负责应用层面，
> 回答"代码哪一行错了、为什么错了"。两者互补：
> Grafana 告警告诉你"出事了"，Sentry 告诉你"怎么修"。
> 而且 Grafana 有 Sentry 数据源插件，可以在同一个 Dashboard 里
> 同时看到 Prometheus 指标和 Sentry 错误事件。

## 4. M3 经验教训对 M4 的影响

| M3 踩坑 | M4 应对 |
|---|---|
| DeepSeek 不支持 tools + structuredOutput | M4 继续用纯 markdown 输出，不依赖 structuredOutput |
| `apps/backend/.env` 覆盖 MODEL_PROVIDER | 新增 SENTRY_DSN / SENTRY_AUTH_TOKEN 时注意 env 层级 |
| Agent maxSteps 耗尽 | 新增 sentry-tool 后 tools 变多，可能需要提高 maxSteps |
| GBrain 自建层过度设计 | M4 的 sentry-tool 直接调 Sentry HTTP API，不要自建 Sentry Client 封装层 |
| RAG 模块未接入 | M4 暂不接 RAG，等 OpenHands 阶段再整合 |

## 5. 建议执行顺序

### Phase A：前端错误采集（M4-01 → M4-02 → M4-03 → M4-05）

1. **M4-01** Vite 生产构建开启 sourceMap（`build.sourcemap: true`，默认 hidden）
2. **M4-02** 确认 `.map` 文件不出现在 public 目录
3. **M4-03** 安装 `@sentry/react`，初始化 DSN，添加 ErrorBoundary
4. **M4-05** 配置 Sentry breadcrumbs（路由变更、用户操作、HTTP 请求）

### Phase B：Source Map 上传 + 反解（M4-04 → M4-07 → M4-08）

5. **M4-04** 构建时用 `@sentry/vite-plugin` 自动上传 Source Map + 设置 release
6. **M4-07** 写一个简化的 symbolication endpoint（用 `source-map` 库），作为教学演示
7. **M4-08** 写文档对比 Sentry 自动反解 vs 自研反解的原理差异

### Phase C：Agent 整合（M4-09）

8. **M4-09** 新增 sentry-tool → 更新 Agent instructions → 前端错误也能出 Incident Report

### Phase D（可选/推迟）

- **M4-06** MinIO：如果 Sentry SaaS 够用则跳过
- **M4-10** OTel Web SDK：推迟到 M6

## 6. 依赖与前置条件

| 卡片 | 前置 |
|---|---|
| M4-01 | 无 |
| M4-02 | M4-01 |
| M4-03 | M4-02，需要 Sentry DSN |
| M4-04 | M4-03，需要 Sentry Auth Token |
| M4-05 | M4-03 |
| M4-06 | 无（独立） |
| M4-07 | M4-01（需要 .map 文件） |
| M4-08 | M4-04 + M4-07 |
| M4-09 | M4-03 + M4-04（Sentry 有数据）+ M3 analysis pipeline |
| M4-10 | 无（独立），但和 M4-03 有上下文关联 |

## 7. 环境准备清单

| 项目 | 状态 | 说明 |
|---|---|---|
| Sentry CLI | ✅ 已安装 | `@sentry/cli` v3.5.0（npx），需执行 `npx @sentry/cli login` |
| Sentry 账号 | ❓ 待确认 | sentry.io 免费注册（14 天试用） |
| Sentry DSN | ❓ 待创建 | 创建项目后获得 |
| Sentry Auth Token | ❓ 待创建 | 用于 Source Map 上传 + CLI 认证 |
| GlitchTip Docker 镜像 | 未拉取 | `gitlab.com/glitchtip/glitchtip`，~512 MB |
| GlitchTip PostgreSQL | 已有 | 可复用现有 `opsagent-postgres` |
| `ERROR_TRACKING_PROVIDER` | 待配置 | 环境变量，切换 sentry / glitchtip / custom |
| `@sentry/react` | 未安装 | npm 包 |
| `@sentry/node` | 未安装 | npm 包，后端 Hono 集成 |
| `@sentry/vite-plugin` | 未安装 | 构建时上传 Source Map |
| `source-map` | 未安装 | M4-07 自研反解用 |
| 自研 browser-sdk | ✅ 已有 | [GitHub 仓库](https://github.com/daxiguaguagua-hash/nodejs-and-frontend-performance-optimization) |
| ~~MinIO Docker 镜像~~ | ~~已取消~~ | M4-06 cancelled，Sentry/GlitchTip 自带存储 |

## 8. 开放问题（待讨论）

### 已决定

- [x] Sentry 自建 vs SaaS → **SaaS + GlitchTip + 自研三层方案**（§1.5）
- [x] Sentry 自建版可行性 → **不可行**（7.75 GB 内存带不动）
- [x] MinIO 是否砍掉 → **砍掉**（§3.2，Sentry/GlitchTip 都自带 Source Map 存储）
- [x] 三层方案切换机制 → **`ERROR_TRACKING_PROVIDER` 环境变量**（§3.1）
- [x] 执行顺序 → **先 Sentry SaaS 跑通，再切 GlitchTip 验证**

### 待讨论

- [ ] GlitchTip 什么时候接入？Phase B 完成后接入（先 Sentry 跑通全流程）
- [ ] 自研 SDK 的 error-collector 是在 OpsAgent 前端里用，还是只在教学项目里演示？
- [ ] M4-10 前端 OTel 推迟到 M6？（倾向推迟）
- [ ] 是否需要 Sentry 的 Session Replay 功能？
- [ ] 前端 "触发前端异常" 按钮的错误事件需要怎样设计才能被 Sentry 正确捕获？
- [ ] Agent 的 sentry-tool 是调 Sentry SaaS API 还是调 GlitchTip 本地 API？

---

*本文档为 M4 规划讨论稿，随讨论进展持续更新。*

## 反向引用

- [[0006-sentry-release-sourcemap-strategy|ADR-0006]]：关联（§5 Phase B 执行顺序）
- [[M4-04-sentry-release-sourcemap-upload|M4-04 任务卡]]：实施依据（§1 目标）
