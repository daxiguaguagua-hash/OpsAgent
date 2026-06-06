#!/usr/bin/env bash
set -euo pipefail

payload="$(cat || true)"
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# 没有用 tsx 跑 hook，因为它在当前环境会创建 IPC（进程间通信）管道并触发权限问题；
# 现在改成 Node 原生 --experimental-strip-types 执行 TS，更稳。
if command -v node >/dev/null 2>&1 && [[ -d "$project_dir/packages/workflow-gates" ]]; then
  printf "%s" "$payload" | node --experimental-strip-types "$project_dir/packages/workflow-gates/src/preToolGuard.ts"
else
  printf "%s" "$payload" | bash "$project_dir/.claude/hooks/pre-tool-guard.sh"
fi
