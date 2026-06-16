-- GlitchTip 独立 DB + user 初始化脚本
-- 在 opsagent-postgres 容器内执行：
--   psql -U postgres -d opsagent -f /tmp/glitchtip-init.sql
--
-- 用途：给 GlitchTip 新建独立数据库和专用用户，与现有 opsagent DB 隔离
-- 关联任务：M4-11（GlitchTip 平替 Sentry spike）

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'glitchtip') THEN
    CREATE ROLE glitchtip WITH LOGIN PASSWORD 'glitchtip';
  END IF;
END
$$;

SELECT 'CREATE DATABASE glitchtip OWNER glitchtip'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'glitchtip')
\gexec

GRANT ALL PRIVILEGES ON DATABASE glitchtip TO glitchtip;
