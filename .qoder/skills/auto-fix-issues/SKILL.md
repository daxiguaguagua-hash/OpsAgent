---
name: auto-fix-issues
description: Automatically detect and fix build, type-check, lint, and test failures in the current workspace. Use when the user reports a failing command, CI red, or asks to "fix issues" in a file/package/branch.
disable-model-invocation: true
---

# Auto-Fix Issues

Automated triage-and-fix workflow for this monorepo (`pnpm` + `turbo`, ESM TypeScript).

## Input

`$ARGUMENTS` may be one of:
- A file path (scope fix to that file + its package)
- A package name (e.g. `@opsagent/agent`)
- Empty (run across the whole repo)

## Workflow

1. **Scope resolution**
   - If a file path is given, identify its workspace package via the nearest `package.json`.
   - If a package name is given, use `-F <package>` turbo filters.
   - Otherwise, operate on the whole repo.

2. **Structural pre-scan (CodeGraph first)** — 在跑编译/测试之前，先用 CodeGraph 建立代码地图：
   - `codegraph_context`：以失败/可疑符号为入口，一次拿到相关符号、caller/callee、关键片段。
   - `codegraph_impact`：对即将修改的符号做爆炸半径分析，避免修一个签名导致 N 处连锁报错。
   - `codegraph_trace`：当 stderr 只有运行时栈（函数名 + 行号）时，从入口追到出错点，找根因而不是改表面。
   - 仅在 CodeGraph 未覆盖（非 TS 文件、刚编辑未索引）时才回退到 Grep/Read 确认细节。

2.5. **Library-specific errors (Context7)** — 当错误涉及第三方库的 API 变更、废弃特性或版本行为差异时（如 Hono 中间件签名变化、Vitest 配置项更名、tsdown 选项废弃），先用 Context7 查询该库的最新文档，确认正确用法后再修复。不要凭旧知识猜测。

3. **Run diagnostic pipeline** in order (stop at first hard failure, fix, then re-run):
   - `pnpm turbo build` (scoped)
   - `pnpm turbo check-types` (scoped)
   - `pnpm turbo test` (scoped)

   Capture stderr/stdout per failure. Classify each error as: type error, missing import, missing dep, lint issue, test assertion failure, runtime error.

4. **Fix each issue** using the least-invasive change:
   - Type errors: narrow types, fix generics, adjust `satisfies`/`as const` usage.
   - Missing imports: add from the canonical module; never inline string literals for domain values — follow the `AGENTS.md` rule (import from `constants/` or the domain module; use `as const` objects).
   - Missing deps: prefer `catalog:` references when adding to `package.json`; run `pnpm install` after edits.
   - Test failures: fix the production code first; only update the test if the test itself is wrong (and say so explicitly).
   - **Before changing a function/class/type signature**: run `codegraph_callers` on the symbol; update callers in the same commit, or narrow the change to avoid it.
   - **After fixing a domain constant** (task status, role, actor, message type, error code): run `codegraph_impact` to confirm every remaining consumer imports from the unified definition — flag any leftover string literal for manual review.

5. **Re-run the failing stage** after each fix. Max 3 iterations per stage; if still failing, stop and report.

6. **Report** a concise summary: what failed, what was changed (file:line), and what (if anything) remains unfixed.

## Guardrails

- Never silently swallow errors with `try {} catch {}` or `// @ts-ignore` as a "fix".
- Never modify test fixtures or expectations to hide a real bug.
- Do not add features, refactor, or rename symbols beyond what the failure demands.
- If a fix requires a schema change, DB migration, or cross-package contract change, **ask before applying**.
- Respect `AGENTS.md`: no hardcoded domain strings in any fix.

## Output

End with a short list:
- Fixed: `<file>:<line> — <what changed>`
- Unfixed: `<error summary> — why it needs human review`
