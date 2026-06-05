#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .claude/active-goal ]]; then
  echo "OpsAgent Stop hook: no .claude/active-goal found; strict gate skipped."
  exit 0
fi

active_goal="$(head -n 1 .claude/active-goal | tr -d '[:space:]')"

fail() {
  echo "OpsAgent Stop hook blocked: $1" >&2
  exit 2
}

check_file() {
  [[ -f "$1" ]] || fail "missing required file: $1"
}

check_dir() {
  [[ -d "$1" ]] || fail "missing required directory: $1"
}

case "$active_goal" in
  M0)
    check_dir apps/frontend
    check_dir apps/backend
    check_dir apps/agent
    check_dir packages/shared
    check_dir observability
    check_dir docs

    check_file package.json
    check_file pnpm-workspace.yaml
    check_file turbo.json
    check_file docker-compose.yml
    check_file .gitignore
    check_file .env.example
    check_file CODEOWNERS
    check_file docs/team-ownership.md

    grep -q "docs/issues/M0-project-scaffold.md" README.md || fail "README.md must link to M0 document"
    grep -q "apps/\\*" pnpm-workspace.yaml || fail "pnpm-workspace.yaml must include apps/*"
    grep -q "packages/\\*" pnpm-workspace.yaml || fail "pnpm-workspace.yaml must include packages/*"

    if git ls-files --error-unmatch .env >/dev/null 2>&1; then
      fail ".env must not be tracked by git"
    fi

    if command -v docker >/dev/null 2>&1; then
      docker compose config >/dev/null || fail "docker compose config failed"
    else
      fail "docker command not found; cannot verify docker-compose.yml"
    fi

    if command -v pnpm >/dev/null 2>&1; then
      pnpm build >/tmp/opsagent-pnpm-build.log 2>&1 || {
        cat /tmp/opsagent-pnpm-build.log >&2
        fail "pnpm build failed"
      }
    else
      fail "pnpm command not found; cannot verify workspace build"
    fi
    ;;
  *)
    echo "OpsAgent Stop hook: active goal '$active_goal' has no strict checker yet; skipped."
    ;;
esac

exit 0
