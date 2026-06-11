---
name: auto-doc
description: Automatically generate and refresh documentation for source modules, packages, and workflows. Use when the user says "generate docs", "document this", or asks to update READMEs / task docs / API comments for a file or package.
disable-model-invocation: true
---

# Auto-Doc

Generate focused, useful documentation for TypeScript source in this `pnpm` + `turbo` monorepo.

## Input

`$ARGUMENTS` may be:
- A source file path (document that file's public API)
- A package directory (refresh its `README.md` and key-module comments)
- A task id like `M3-05` (generate/refresh `docs/issues/<task-id>-*.md`)
- Empty (scan for stale or missing docs)

## Workflow

1. **Pick the right doc artifact** for the input:

   | Input | Artifact |
   |---|---|
   | Source file | JSDoc on public exports (brief) + optional inline `//` for non-obvious *why* only |
   | Package dir | Package `README.md`: purpose, install, main entry points, key scripts |
   | Task id | `docs/issues/<task-id>-<slug>.md` matching existing task-doc shape |
   | Workflow / flow | `docs/workflows/<name>.md` with sequence steps and actors |

2. **Read existing docs first.** If a README or issue doc already exists, diff the code against it and update only the stale parts — do not overwrite. Preserve author voice and manual notes.

3. **Enumerate the real surface (CodeGraph first)**
   - `codegraph_files` on the target directory → the authoritative list of source files (no manual glob needed).
   - `codegraph_node` (with `includeCode: true`) on each public export → exact signature + existing docstring; don't re-describe what the name already says, only add purpose/`@param`/`@returns` when types alone don't convey meaning.
   - `codegraph_callers` on the most-used exports → pick 1–2 real callers as usage examples for READMEs (real code beats invented snippets).
   - `codegraph_trace` for workflow / flow docs → one call returns the full trigger chain, so the doc reflects the actual path instead of a hand-drawn guess.
   - `codegraph_search` to cross-check every symbol/path cited in existing docs — more accurate than Grep for same-name symbols across packages.
   - Fall back to Read/Grep only for non-TS assets (config, markdown, YAML fixtures) or to quote exact comment text.

3.5. **Third-party API references (Context7)** — 当文档涉及第三方库的 API 用法（如 README 中的示例代码、JSDoc 中的 `@param` 类型引用），用 Context7 验证所写用法与库的当前版本一致，避免文档中出现过时或错误的 API 描述。

4. **Generate content that earns its lines**:
   - For JSDoc: one sentence of *purpose*, `@param`/`@returns` only when types alone don't convey meaning. Skip obvious getters/setters.
   - For READMEs: a 1-line purpose, install/use snippet, and a "Key modules" list pointing at the entry files (not a component dump).
   - For task docs: goal, scope, acceptance criteria, affected packages, verification command — matching the shape in `docs/task-breakdown.md` and `docs/workflows/agent-execution-workflow.md`.

5. **Honor AGENTS.md**
   - Use canonical constants (task status, roles, actors, message types, error codes) when naming states or transitions in docs — quote the constant name (`TASK_STATUS.PLANNED`) so the doc stays accurate if the string value changes.
   - Don't hardcode example strings that should be imported.

6. **Language**
   - Match the surrounding file's language: Chinese for `docs/issues/` and `docs/workflows/` (the existing task docs are in Chinese), English for package READMEs and inline JSDoc. When in doubt, follow the nearest existing doc.

7. **Verify**
   - After writing, re-read the file to catch truncated or duplicated sections.
   - If doc references a file path or symbol, run `codegraph_search` to confirm it still exists (more precise than Grep — won't false-match a same-named symbol in another package).

## Guardrails

- Do not pad with generic advice ("this module is important", "handles errors gracefully").
- Do not restate code line-by-line — readers can read the code.
- Do not add emoji, badges, or banners unless the surrounding docs already use them.
- If a symbol is undocumented or ambiguous, ask rather than guess.

## Output

End with:
- Written: `<doc path> — <what's covered>`
- Updated: `<doc path> — <what changed>`
- Skipped: `<target> — <reason>`
