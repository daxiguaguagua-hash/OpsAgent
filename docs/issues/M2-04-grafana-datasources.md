# M2-04: 接入 Grafana 与自动配置数据源

**状态**: 已验证 | **负责人**: sre-team | **优先级**: P0

## 验收标准

- [x] Grafana 13.0.1-security-01 容器可启动且健康检查通过
- [x] Grafana provisioning 自动注册 Prometheus 和 Loki 两个数据源
- [x] 两个数据源通过 Grafana health check 且 URL 使用容器服务名
- [x] Grafana 页面可在 localhost:3000 打开
- [x] 不提前实现 M2-07 Dashboard

## 实现摘要

### 新增文件

- `observability/grafana/provisioning/datasources/datasources.yml` — Grafana provisioning 配置，自动注册 Prometheus（`http://prometheus:9090`）和 Loki（`http://loki:3100`）两个数据源，均使用容器服务名作为 URL

### 修改文件

- `docker-compose.yml` — 新增 `grafana` 服务（`grafana/grafana:13.0.1-security-01`），暴露端口 3000，只挂载 datasource provisioning 子目录和持久化数据卷，健康检查测 `/api/health`
- `observability/README.md` — 更新 Grafana 状态为已激活

### 设计决策

1. **Provisioning 而非手动配置**: 使用 Grafana provisioning 机制（`/etc/grafana/provisioning/datasources/`），容器启动时自动注册数据源，无需手动操作
2. **容器服务名 URL**: datasource URL 使用 Docker Compose 内部服务名（`prometheus`/`loki`），而非 `localhost`，确保容器间网络通信正常
3. **`editable: false`**: 数据源设为不可编辑，防止通过 UI 误改
4. **演示凭据集中配置**: `GRAFANA_ADMIN_USER` 和 `GRAFANA_ADMIN_PASSWORD` 由环境变量注入，示例值统一放在 `.env.example`
5. **最小目录挂载**: 只覆盖 `/etc/grafana/provisioning/datasources`，保留镜像自带的 plugins、alerting 和 dashboards 配置目录
6. **默认简体中文**: 使用 `GRAFANA_DEFAULT_LANGUAGE=zh-Hans` 设置全局默认语言；用户仍可在 Profile（个人资料）中覆盖

## 验证步骤

```bash
# 1. 启动全部服务
pnpm infra:up

# 2. 等待 Grafana 健康检查通过
docker ps --filter name=opsagent-grafana --format "{{.Status}}"

# 3. 登录 Grafana
# 浏览器打开 http://localhost:3000 → admin/admin

# 4. 验证数据源
# Connections → Data sources → 应看到 Prometheus 和 Loki 均为绿色

# 5. 健康检查 API
curl http://localhost:3000/api/health
```

## 真实验收记录

2026 年 6 月 7 日执行：

| 验收项 | 结果 |
|---|---|
| Grafana 容器 | `healthy` |
| Grafana API | `/api/health` 返回 `database: ok` |
| Grafana 版本 | `13.0.1+security-01` |
| Prometheus datasource | UID `opsagent-prometheus`，health 返回 `OK` |
| Loki datasource | UID `opsagent-loki`，health 返回 `OK` |
| Prometheus 代理查询 | 经 Grafana proxy 查询 `up` 成功 |
| Loki 代理查询 | 经 Grafana proxy 执行 LogQL 成功 |
| 登录页面 | `/login` 返回完整 Grafana HTML 和前端资源清单 |
| 默认语言 | 容器配置为 `zh-Hans`；部分插件和未翻译界面仍可能显示英文 |

内置浏览器在本次会话中没有可用实例，因此页面验收采用 HTTP 页面与静态资源响应验证，未生成自动化截图。

首次启动时发现挂载整个 `/etc/grafana/provisioning` 会覆盖镜像自带目录，并产生 plugins、alerting、dashboards 目录缺失日志。修正为仅挂载 `datasources` 子目录后，错误消失。
