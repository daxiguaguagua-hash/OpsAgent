# M2-06 Tempo 链路追踪 — 完整测试手册

> 面向从前端转 AI 全栈/运维的同学。如果你之前只写过 React，这份手册会帮你理解"可观测性"是什么、Tempo 在整个链路里扮演什么角色、以及怎么一步步验证它工作正常。

---

## 一、先搞懂概念：可观测性三支柱

做运维不像做前端——你看不到用户的浏览器，只能通过"数据"推断系统在干嘛。业界把运维数据分成三类：

| 支柱 | 类比 | 本项目工具 | 端口 |
|---|---|---|---|
| **指标（Metrics）** | 汽车仪表盘（时速、油量） | Prometheus | 9090 |
| **日志（Logs）** | 行车记录仪（每一帧画面） | Loki + Alloy | 3100 |
| **链路追踪（Traces）** | GPS 轨迹（一次出行经过了哪些路口） | **Tempo** ← 本手册重点 | 3200 |

链路追踪回答的核心问题是：**"一个 HTTP 请求从进入到返回，经过了哪些步骤、每步花了多久、哪里出了错？"**

### 关键术语

- **Trace**：一次完整请求的"旅程"，由一个 32 位十六进制的 `traceId` 标识
- **Span**：Trace 里的一个"步骤"，比如 `GET /api/orders/health` 是一个 Span
- **OTLP**：OpenTelemetry Protocol，发送 trace 数据的标准协议
- **OTel Collector**：一个"中转站"——后端把 span 发给它，它再转发给 Tempo
- **W3C traceparent**：跨服务传递 traceId 的标准 header

### 本项目的链路追踪架构

```
浏览器/curl 发请求
      │
      ▼
┌─────────────────┐
│  Backend (8000) │  ← Hono 框架 + tracing middleware
│  产生 OTel Span │     每个请求自动创建一个 Span
└────────┬────────┘
         │ OTLP HTTP (端口 4318)
         ▼
┌─────────────────┐
│  OTel Collector │  ← 中转站，接收 → 批处理 → 转发
│  (端口 4317/4318)│
└────────┬────────┘
         │ OTLP HTTP
         ▼
┌─────────────────┐
│  Tempo (3200)   │  ← Trace 数据库，存储和索引
└────────┬────────┘
         │ HTTP API
         ▼
┌─────────────────┐
│  Grafana (3000) │  ← 可视化，查 Trace、看 Span 树
└─────────────────┘
```

---

## 二、前置准备

### 2.1 确认 Docker 已启动

```bash
docker info > /dev/null 2>&1 && echo "Docker OK" || echo "Docker 未启动！"
```

### 2.2 启动所有服务

在项目根目录执行：

```bash
cd OpsAgent
docker compose up -d
```

等待所有容器启动（首次拉镜像可能需要几分钟）。

### 2.3 确认所有 8 个容器都在运行

```bash
docker compose ps
```

你应该看到这些容器全部 `Up`：

| 容器名 | 镜像 | 端口 | 作用 |
|---|---|---|---|
| `opsagent-postgres` | postgres:16 | 5432 | 数据库 |
| `opsagent-redis` | redis:7-alpine | 6379 | 缓存 |
| `opsagent-prometheus` | prom/prometheus:v3.2.1 | 9090 | 指标存储 |
| `opsagent-loki` | grafana/loki:3.7.2 | 3100 | 日志存储 |
| `opsagent-alloy` | grafana/alloy:v1.16.1 | — | 日志采集器 |
| `opsagent-grafana` | grafana/grafana:13.0.1 | **3000** | 可视化平台 |
| `opsagent-otel-collector` | otel/opentelemetry-collector-contrib:0.153.0 | 4317/4318/13133 | Trace 中转站 |
| `opsagent-tempo` | grafana/tempo:2.9.1 | **3200** | Trace 存储 |

### 2.4 启动后端

```bash
pnpm --filter backend dev
```

后端会启动在 `http://localhost:8000`。

---

## 三、逐层验证（从底层到顶层）

### 3.1 第 1 层：确认 Tempo 容器存活

Tempo 提供了一个 `/api/echo` 端点用于健康检查：

```bash
curl http://localhost:3200/api/echo
```

**期望输出**：`echo`

如果看到 `echo`，说明 Tempo 容器已正常运行。

### 3.2 第 2 层：确认 OTel Collector 健康

Collector 有自己的健康检查端口：

```bash
curl http://localhost:13133
```

**期望输出**（JSON）：

```json
{
  "status": "Server available",
  "upSince": "2026-06-10T03:25:35.701000676Z",
  "uptime": "..."
}
```

如果看到 `Server available`，说明 Collector 已就绪。

### 3.3 第 3 层：发请求产生 Trace，确认落库到 Tempo

先给后端发两个请求——一个正常、一个故意报错：

```bash
# 正常请求：健康检查
curl http://localhost:8000/api/orders/health

# 故意报错：触发 500
curl -X POST http://localhost:8000/api/demo/fail-500
```

**等 10 秒**（OTel 的 BatchSpanProcessor 默认 5 秒刷一次，留点余量）：

```bash
sleep 10
```

然后查 Tempo 有没有收到 trace：

```bash
curl -s "http://localhost:3200/api/search?limit=10" | python3 -m json.tool
```

**期望输出**：你会看到一个 `traces` 数组，里面包含类似这样的条目：

```json
{
  "traceID": "2f9be6d33cdd56f21b9d201157ce94e1",
  "rootServiceName": "opsagent-backend",
  "rootTraceName": "POST /api/demo/fail-500",
  "durationMs": 1
}
```

重点关注 `rootTraceName`——应该能看到 `GET /api/orders/health` 和 `POST /api/demo/fail-500`，而不仅仅是 `GET /metrics`（后者是 Prometheus 每 15 秒自动抓取的）。

> **如果只看到 `GET /metrics`**：说明你的业务 trace 还没刷到 Tempo，再等 5 秒重新查。或者增大 `limit` 值。

### 3.4 第 4 层：查看单个 Trace 的完整 Span 详情

从上一步的输出里拿一个 `traceID`，查它的详情：

```bash
# 替换成你实际看到的 traceID
curl -s "http://localhost:3200/api/traces/2f9be6d33cdd56f21b9d201157ce94e1" | python3 -m json.tool
```

**期望输出**（以 fail-500 为例）：

```json
{
  "batches": [{
    "resource": {
      "attributes": [{
        "key": "service.name",
        "value": { "stringValue": "opsagent-backend" }
      }]
    },
    "scopeSpans": [{
      "scope": { "name": "opsagent-backend-http" },
      "spans": [{
        "name": "POST /api/demo/fail-500",
        "kind": "SPAN_KIND_SERVER",
        "attributes": [
          { "key": "http.request.method", "value": { "stringValue": "POST" } },
          { "key": "url.path", "value": { "stringValue": "/api/demo/fail-500" } },
          { "key": "http.response.status_code", "value": { "intValue": "500" } },
          { "key": "opsagent.error.code", "value": { "stringValue": "DEMO_FORCED_FAILURE" } }
        ],
        "status": { "code": "STATUS_CODE_ERROR" }
      }]
    }]
  }]
}
```

**逐项检查**：

| 字段 | 正常请求的值 | 500 请求的值 | 说明 |
|---|---|---|---|
| `service.name` | `opsagent-backend` | `opsagent-backend` | 服务标识 |
| `name` | `GET /api/orders/health` | `POST /api/demo/fail-500` | Span 名称 = METHOD + PATH |
| `http.request.method` | `GET` | `POST` | HTTP 方法 |
| `http.response.status_code` | `200` | `500` | 响应状态码 |
| `opsagent.error.code` | _(无)_ | `DEMO_FORCED_FAILURE` | 业务错误码（仅错误时出现） |
| `status.code` | _(空对象)_ | `STATUS_CODE_ERROR` | OTel 标准错误标记 |

### 3.5 第 5 层：查看 Tempo 支持的搜索标签

```bash
curl -s "http://localhost:3200/api/search/tags" | python3 -m json.tool
```

**期望输出**：

```json
{
  "tagNames": [
    "http.request.method",
    "http.response.status_code",
    "opsagent.error.code",
    "service.name",
    "url.path"
  ]
}
```

这些标签就是你在 Grafana 里可以用来过滤 trace 的维度。

---

## 四、在 Grafana 里可视化 Trace（最常用的方式）

命令行查 JSON 不直观。实际工作中你 99% 的时间都在 Grafana 里操作。

### 4.1 打开 Grafana

浏览器访问：**http://localhost:3000**

默认账号密码在 `.env` 文件里：

```
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
```

> **注意**：如果 admin:admin 登录失败，可能是首次启动时修改了密码。可以在 Grafana 容器内重置，或者删掉 `opsagent_grafana_data` volume 重新开始。

### 4.2 确认 Tempo 数据源已注册

1. 点击左侧菜单 → **连接（Connections）** → **数据源（Data Sources）**
2. 你应该看到 3 个数据源：
   - **Prometheus**（默认）
   - **Loki**
   - **Tempo**

3. 点击 **Tempo**，确认：
   - **URL** 显示 `http://tempo:3200`
   - **Authentication** 显示 `No Authentication`
   - 顶部有蓝色提示："This data source was added by config..."（说明是通过配置文件自动注册的，符合预期）

### 4.3 查看 Tempo 的高级联动配置

在 Tempo 数据源配置页往下滚动，你会看到这些关键配置：

**Trace to logs（链路 → 日志跳转）**：

| 配置项 | 值 | 说明 |
|---|---|---|
| Data source | Loki | 点击 Trace 里的 span 可以直接跳到对应的日志 |
| Filter by trace ID | 开启 | 跳转时自动用 traceId 过滤日志 |

这个配置来自 `observability/grafana/provisioning/datasources/datasources.yml` 的 `tracesToLogs` 部分。它的含义是：在 Grafana 里看一个 trace 的 span 时，可以直接点击"查看日志"按钮，Grafana 会自动用这个 traceId 去 Loki 里搜索对应的日志。

### 4.4 在 Explore 里搜索 Trace

这是你最常用的功能：

1. 点击左侧菜单 → **探索（Explore）**
2. 左上角数据源选择 **Tempo**
3. 查询类型选择 **Search**
4. **Service Name** 选择 `opsagent-backend`
5. 点击紫色的 **运行查询** 按钮

你会看到一个 trace 列表。

> **问题**：列表里全是 `GET /metrics`？那是 Prometheus 每 15 秒自动抓取的。切换到 **TraceQL** 标签页，输入以下查询来过滤掉 metrics：

```traceql
{ resource.service.name = "opsagent-backend" && name !~ "GET /metrics" }
```

这样就能看到你的业务请求 trace 了。

### 4.5 查看单个 Trace 的详情

点击任意一条 trace，右侧会展开详情面板：

- **节点图（Node Graph）**：可视化 span 之间的关系
- **跟踪（Trace）**：时间线视图，每个 span 的耗时一目了然
- **属性（Attributes）**：span 的所有标签，包括 HTTP 方法、状态码、错误码

### 4.6 Trace → Logs 跳转测试

1. 在 Trace 详情里找到一个 span
2. 如果配置正确，你会看到 **"Logs for this span"** 或类似按钮
3. 点击后会跳转到 Loki Explore，自动用 traceId 过滤出对应的日志

---

## 五、运行自动化测试

### 5.1 运行全部测试

```bash
pnpm --filter backend test
```

**期望输出**：`tests 91, pass 91, fail 0`

### 5.2 测试文件说明

每个 observability 模块都有独立的测试文件，测试描述全部使用中文：

| 测试文件 | 对应的源文件 | 测试数量 | 覆盖内容 |
|---|---|---|---|
| `tracing.test.ts` | `tracing.ts` | 12 | OTel Span 创建、属性、状态码、错误处理、初始化/关闭 |
| `traceProxy.test.ts` | `traceProxy.ts` | 8 | Tempo 代理 API（成功/404/503/异常隔离/content-type 透传） |
| `logger.test.ts` | `logger.ts` | 16 | JSON 日志格式、traceId 继承、文件 sink、容错 |
| `metrics.test.ts` | `metrics.ts` | 7 | Prometheus 计数器/直方图、标签、/metrics 端点格式 |
| `constants.test.ts` | `constants.ts` | 17 | 所有常量值校验、正则测试、URL 合法性 |
| `app.test.ts` | `app.ts` | 23 | 集成测试（覆盖业务接口+可观测性端到端） |

### 5.3 单独运行某个测试文件

```bash
# 只跑 tracing 的测试
pnpm --filter backend exec tsx --test src/observability/tracing.test.ts

# 只跑 traceProxy 的测试
pnpm --filter backend exec tsx --test src/observability/traceProxy.test.ts

# 只跑 logger 的测试
pnpm --filter backend exec tsx --test src/observability/logger.test.ts
```

---

## 六、Docker Compose 配置文件速查

所有可观测性的配置文件都在 `observability/` 目录下：

```
observability/
├── tempo/tempo.yml              # Tempo 配置（存储、接收端口）
├── otel/collector-config.yml    # OTel Collector 配置（接收→处理→导出）
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── datasources.yml  # Grafana 数据源自动注册
│   │   └── dashboards/
│   │       └── dashboards.yml   # Dashboard 自动注册
│   └── dashboards/
│       └── backend-overview.json # 后端概览 Dashboard
├── prometheus/prometheus.yml    # Prometheus 抓取配置
├── loki/loki-config.yml         # Loki 日志存储配置
└── alloy/config.alloy           # Alloy 日志采集配置
```

### Tempo 关键配置解读（`tempo.yml`）

```yaml
server:
  http_listen_port: 3200          # Grafana 查询用的端口

distributor:
  receivers:
    otlp:
      protocols:
        http:
          endpoint: 0.0.0.0:4318  # 接收 OTLP HTTP spans
        grpc:
          endpoint: 0.0.0.0:4317  # 接收 OTLP gRPC spans

compactor:
  compaction:
    block_retention: 1h            # ⚠️ Trace 只保留 1 小时！

storage:
  trace:
    backend: local                 # 本地存储（开发环境够用）
```

### OTel Collector 关键配置解读（`collector-config.yml`）

```yaml
pipelines:
  traces:
    receivers: [otlp]              # 从后端接收 spans
    processors: [batch]            # 攒一批再发（提高性能）
    exporters: [debug, otlp_http/tempo]  # 同时输出到控制台和 Tempo
```

`debug` exporter 让你在 `docker compose logs otel-collector` 时能看到 span 数据，方便调试。

---

## 七、常用排查命令

### 查看 OTel Collector 日志（看 span 有没有经过 Collector）

```bash
docker compose logs --tail 50 otel-collector
```

你应该能看到 span 的 JSON 输出（因为有 `debug` exporter）。

### 查看 Tempo 日志（看 Tempo 有没有收到和存储 span）

```bash
docker compose logs --tail 50 tempo
```

### 后端环境变量确认

```bash
# 检查后端的 OTel 配置
cat .env | grep OTEL
```

期望看到：

```
OTEL_TRACES_ENABLED=true
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
```

### 查看后端发出的请求 traceId

```bash
# 响应头里的 x-trace-id 就是这次请求的 traceId
curl -s -i http://localhost:8000/api/orders/health | grep x-trace-id
```

输出类似：`x-trace-id: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`

拿这个 traceId 去 Tempo 查就能找到对应的 span。

### 清空 Tempo 数据重新开始

```bash
docker compose down
docker volume rm opsagent_opsagent_tempo_data
docker compose up -d
```

---

## 八、完整验证 Checklist

按顺序逐项打勾：

- [ ] Docker 启动，8 个容器全部 `Up`
- [ ] `curl localhost:3200/api/echo` 返回 `echo`
- [ ] `curl localhost:13133` 返回 `Server available`
- [ ] 后端启动在 8000 端口
- [ ] `curl localhost:8000/api/orders/health` 返回 200
- [ ] `curl -X POST localhost:8000/api/demo/fail-500` 返回 500
- [ ] 等 10 秒后查 Tempo search API，能看到业务 trace
- [ ] 查 trace 详情，span 包含正确的 service.name、method、status_code
- [ ] 500 trace 的 span 包含 `opsagent.error.code: DEMO_FORCED_FAILURE`
- [ ] 500 trace 的 span status 为 `STATUS_CODE_ERROR`
- [ ] Grafana 3000 端口可访问，admin 登录成功
- [ ] Grafana 数据源列表里有 Prometheus、Loki、Tempo
- [ ] Tempo 数据源配置 URL 为 `http://tempo:3200`
- [ ] Trace to logs 配置指向 Loki
- [ ] Explore → Tempo → Search → 运行查询 → 能看到 trace 列表
- [ ] TraceQL 过滤 `{ name !~ "GET /metrics" }` 能看到业务 trace
- [ ] 点击 trace 能看到 span 详情和时间线
- [ ] `pnpm --filter backend test` 全部 91 个测试通过

---

## 九、常见问题

**Q：Tempo search 返回空数组？**
A：Trace 保留只有 1 小时（`block_retention: 1h`）。确保你在 1 小时内发过请求。

**Q：只看到 GET /metrics，看不到业务 trace？**
A：Prometheus 每 15 秒抓一次 /metrics，会产生大量 trace。增大 `limit` 参数，或者用 TraceQL 过滤。

**Q：Grafana 用 admin:admin 登不上？**
A：`GF_SECURITY_ADMIN_PASSWORD` 只在 Grafana 首次启动时生效。如果之前改过密码，需要删 volume 重建：
```bash
docker compose down
docker volume rm opsagent_opsagent_grafana_data
docker compose up -d
```

**Q：后端启动报端口占用？**
A：`lsof -i :8000` 查看谁占了 8000 端口，`kill` 掉再启动。

**Q：OTel Collector 报连不上 Tempo？**
A：确认 tempo 容器已启动。Collector 的 `otlp_http/tempo` exporter 用的是 Docker 内部域名 `http://tempo:4318`，只有容器间能访问。

**Q：想加长 trace 保留时间？**
A：改 `observability/tempo/tempo.yml` 的 `block_retention`，比如改成 `24h`，然后 `docker compose restart tempo`。
