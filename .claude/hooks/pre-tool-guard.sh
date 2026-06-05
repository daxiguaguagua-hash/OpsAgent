#!/usr/bin/env bash
set -euo pipefail

payload="$(cat || true)"

extract_field() {
  local field="$1"
  node -e '
const fs = require("fs");
const field = process.argv[1];
const input = fs.readFileSync(0, "utf8");
try {
  const data = JSON.parse(input || "{}");
  const value = field.split(".").reduce((acc, key) => acc && acc[key], data);
  if (typeof value === "string") process.stdout.write(value);
} catch (_) {}
' "$field" <<<"$payload"
}

tool_name="$(extract_field tool_name)"
command_value="$(extract_field tool_input.command)"

paths="$(
  node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
try {
  const data = JSON.parse(input || "{}");
  const toolInput = data.tool_input || {};
  const paths = [];
  for (const key of ["file_path", "path"]) {
    if (typeof toolInput[key] === "string") paths.push(toolInput[key]);
  }
  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (edit && typeof edit.file_path === "string") paths.push(edit.file_path);
    }
  }
  process.stdout.write(paths.join("\n"));
} catch (_) {}
' <<<"$payload"
)"

block() {
  echo "OpsAgent hook blocked: $1" >&2
  exit 2
}

if [[ -n "$paths" ]]; then
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    base="$(basename "$path")"
    case "$base" in
      .env|*.pem|*.key|*.p12|*.pfx|id_rsa|id_ed25519)
        block "do not write secrets or private key files ($path)"
        ;;
    esac
  done <<<"$paths"
fi

if [[ "$tool_name" == "Bash" && -n "$command_value" ]]; then
  case "$command_value" in
    *"git reset --hard"*|*"git clean -fd"*|*"git checkout --"*|*"rm -rf"*|*"docker compose down -v"*|*"docker volume rm"*)
      if [[ "${OPSAGENT_ALLOW_DESTRUCTIVE:-}" != "1" ]]; then
        block "destructive command requires explicit human approval: $command_value"
      fi
      ;;
  esac
fi

if [[ -f .claude/active-goal ]]; then
  active_goal="$(head -n 1 .claude/active-goal | tr -d '[:space:]')"
  if [[ "$active_goal" == "M0" && -n "$paths" ]]; then
    allowed=0
    while IFS= read -r path; do
      [[ -z "$path" ]] && continue
      case "$path" in
        README.md|./README.md|package.json|./package.json|pnpm-workspace.yaml|./pnpm-workspace.yaml|turbo.json|./turbo.json|docker-compose.yml|./docker-compose.yml|.gitignore|./.gitignore|.env.example|./.env.example|CODEOWNERS|./CODEOWNERS|docs/*|./docs/*|apps/*|./apps/*|packages/*|./packages/*|observability/*|./observability/*|.claude/*|./.claude/*)
          allowed=1
          ;;
        *)
          block "M0 active-goal only allows project scaffold paths, got: $path"
          ;;
      esac
    done <<<"$paths"
  fi
fi

exit 0
