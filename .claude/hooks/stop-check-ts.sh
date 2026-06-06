#!/usr/bin/env bash
set -euo pipefail

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"

if command -v node >/dev/null 2>&1 && [[ -d "$project_dir/packages/workflow-gates" ]]; then
  (cd "$project_dir" && node --experimental-strip-types packages/workflow-gates/src/stopCheck.ts)
else
  bash "$project_dir/.claude/hooks/stop-check.sh"
fi
