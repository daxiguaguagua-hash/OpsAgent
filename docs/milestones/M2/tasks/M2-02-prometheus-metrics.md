# M2-02 Prometheus 指标闭环

## 1. 目标

让 Backend（后端）暴露 Prometheus（指标系统）格式的请求指标，并提供可由 Docker Compose（容器编排）启动的 Prometheus 抓取配置。

```mermaid
flowchart LR
  Request[HTTP 请求] --> Metrics[请求计数与耗时指标]
  Metrics --> Endpoint[GET /metrics]
  Endpoint --> Prometheus[Prometheus 指标系统]
```

## 2. 指标合同

| 指标 | 类型 | 标签 |
|---|---|---|
| `http_requests_total` | Counter（计数器） | `method`、`route`、`status_code` |
| `http_request_duration_seconds` | Histogram（直方图） | `method`、`route`、`status_code` |

`/metrics` 自身不会写入上述业务请求指标，避免 Prometheus 定时抓取产生递归噪声。跨实现和测试使用的路由、指标名、标签名与 Content-Type（内容类型）统一定义在 `apps/backend/src/observability/constants.ts`。

## 3. 测试证据

| 验证项 | 结果 |
|---|---|
| Backend（后端）测试 | 16/16 通过 |
| TypeScript（类型脚本）类型检查 | 通过 |
| Compose 配置解析 | 通过 |
| 200 请求计数 | 通过 |
| 500 请求计数 | 通过 |
| 请求耗时 Histogram（直方图） | 通过 |
| `/metrics` 防递归 | 通过 |
| Prometheus 容器真实抓取 | 通过，`opsagent-backend` Target（目标）状态为 `up` |

## 4. 工作流记录

1. Codex 建立 M2-02 任务合同并批准新增指标测试。
2. Claude Code implementer（实现者）完成主体实现。
3. Claude Code tester（测试者）发现缺少 500 请求指标断言，Codex 通过消息总线发出测试变更请求。
4. Implementer 补齐断言，Tester 在全新只读会话中验证 16/16 测试通过。
5. Reviewer（审查角色）发现 Prometheus 协议字符串未集中管理，并要求补齐文档。
6. 第三次 Claude Code 调用在 `/init` 阶段收到 DeepSeek `402 Insufficient Balance（余额不足）`，未进入主任务，也没有生成消息总线完成事件。
7. Codex 接管常量收口和文档修正。

## 5. 容器集成验证

`docker compose up -d postgres redis prometheus` 在首次拉取 `prom/prometheus:v3.2.1` 时约 8 分钟没有进度，镜像和容器均未出现，随后终止挂起进程。

进一步检查确认 Docker Hub（镜像仓库）网络正常，挂起发生在本机 Docker Credential Helper（凭据助手）。使用只包含空 `auths` 的临时 `DOCKER_CONFIG` 匿名拉取后，镜像下载成功，未修改 Docker Desktop（桌面应用）的全局配置。

启动 Backend（后端）和 Prometheus 后，真实验证结果：

| 验证项 | 结果 |
|---|---|
| Prometheus Target（抓取目标） | `http://host.docker.internal:8000/metrics` |
| Target Health（目标健康状态） | `up` |
| `lastError` | 空 |
| 正常请求指标 | `GET /api/orders/health`，状态码 `200`，值为 `1` |
| 故障请求指标 | `POST /api/demo/fail-500`，状态码 `500`，值为 `1` |

这证明指标不是只存在于应用测试中，而是已经被 Docker 内的 Prometheus 实际抓取和查询。

## 6. 决策状态

状态：接受，M2-02 闭环完成。
