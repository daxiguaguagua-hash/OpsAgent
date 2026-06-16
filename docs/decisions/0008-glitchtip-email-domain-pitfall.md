# ADR-0008: GlitchTip 管理员邮箱禁止使用 `.local` 等保留 TLD

- **日期**：2026-06-16
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[0007-glitchtip-as-sentry-fallback|ADR-0007]]：GlitchTip 自建部署（本决策的运维陷阱来源）

## Context

2026-06-16 部署 GlitchTip 后，浏览器点击左侧栏 "Profile" 无任何反应，F12 Console 持续报 SolidJS 响应式错误（`wt$6.equal` computation）。排查发现根因是：

1. 管理员邮箱创建时使用了 `demo@opsagent.local`
2. `.local` 是 IANA 定义的特殊保留 TLD（RFC 6762，用于 mDNS/Bonjour）
3. GlitchTip 后端使用 Pydantic v2 做 email 校验，`EmailStr` 类型拒绝保留 TLD
4. `/api/0/users/me/` 返回 500（Pydantic `ValidationError`），前端拿不到用户数据
5. SolidJS 框架在收到 500 后静默失败，所有依赖用户信息的交互（Profile 下拉、Account 页面等）全部不可用

**关键症状链**：

```
demo@opsagent.local
  → Pydantic EmailStr 拒绝 .local TLD
    → /api/0/users/me/ 返回 500
      → 前端 SolidJS 无法获取用户数据
        → Profile 点击无反应、Console 报 [object Object] 错误
```

**定位方式**：查看 GlitchTip Docker 容器日志，看到完整的 Pydantic traceback：

```
pydantic_core._pydantic_core.ValidationError: 2 validation errors for NinjaResponseSchema
response.email
  value is not a valid email address: The part after the @-sign is a special-use
  or reserved name that cannot be used with email.
  [type=value_error, input_value='demo@opsagent.local', input_type=str]
```

**修复**：直接在 PostgreSQL 中更新邮箱为合法域名：

```sql
UPDATE users_user SET email = 'demo@opsagent.dev' WHERE email = 'demo@opsagent.local';
```

修复后 `/api/0/users/me/` 恢复 200，Profile 页面正常加载。

## Decision

**GlitchTip 部署时，管理员和所有用户的邮箱禁止使用以下 TLD**：

| 保留 TLD | 来源 | 说明 |
|---|---|---|
| `.local` | RFC 6762 (mDNS) | Pydantic 拒绝 |
| `.localhost` | RFC 6761 | Pydantic 拒绝 |
| `.example` | RFC 2606 | Pydantic 拒绝 |
| `.invalid` | RFC 2606 | Pydantic 拒绝 |
| `.test` | RFC 6761 | Pydantic 拒绝 |

**开发环境邮箱规范**：使用 `.dev`、`.io`、`.app` 等合法 TLD，例如 `demo@opsagent.dev`。

**初始化脚本约束**：GlitchTip 容器初始化脚本（`manage.py createsuperuser` 或 Django shell 创建用户）必须校验邮箱域名，不得使用保留 TLD。

## Consequences

### 正面

- **部署即可用**：避免因邮箱校验导致的 500 错误，Profile / Account / MFA 等所有用户相关页面正常
- **排查路径清晰**：本 ADR 记录了完整的症状链，后续遇到类似问题可直接查容器日志

### 负面

- **开发邮箱不可用 `.local`**：`.local` 在局域网 demo 场景中很直觉，但必须克制；改用 `.dev` 同样直观
- **已有部署需手动修**：如果已经用 `.local` 邮箱创建了用户，需要直接操作 PostgreSQL（GlitchTip 没有提供修改邮箱的 CLI）

### 风险

- **Pydantic 版本升级**：未来 Pydantic 可能放宽或收紧 TLD 校验策略，但 IANA 保留 TLD 短期内不会变
- **GlitchTip 无前端错误提示**：500 错误在 GlitchTip UI 上表现为"静默失败"而非明确的错误消息，容易误导排查方向

## 反向引用

暂无
