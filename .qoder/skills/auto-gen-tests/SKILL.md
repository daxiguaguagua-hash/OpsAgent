---
name: auto-gen-tests
description: Automatically generate unit/integration test files for source modules, matching the repo's test framework and conventions. Use when the user says "generate tests", "cover this file", or asks for test scaffolding for a source file or package.
disable-model-invocation: true
---

# Auto-Gen Tests

Generate tests for TypeScript source modules in this `pnpm` + `turbo` monorepo.

## Input

`$ARGUMENTS` may be:
- A source file path (generate tests for that one file)
- A directory or package name (generate tests for all uncovered public exports)
- Empty (scan and prioritize by lowest coverage / highest risk)

## Workflow

1. **Locate the existing test harness**
   - Read the target package's `package.json` to find the test runner (`vitest`, `jest`, `tsx`-based node test runner — see root `package.json` scripts and the package's own `test` script).
   - Find the nearest existing `*.test.ts` / `*.spec.ts` to mirror: file colocation pattern, naming (`foo.test.ts` vs `foo.spec.ts`), import style, assertion library (`node:test` `assert`, `vitest` `expect`, etc.).
   - If no tests exist in the package, use the convention from the closest sibling package.

2. **Analyze the source module (CodeGraph first)**
   - `codegraph_node` on the target module/container → enumerate public exports (functions, classes, constants, types) without manually parsing AST.
   - `codegraph_callees` on each public symbol → draw its dependency graph; use this to decide the mock boundary (what's injected vs. what's reached internally).
   - `codegraph_explore` on related symbols (client, repository, service, sibling modules) → read them in one capped call to identify mock seams; prefer dependency injection or module-level mocks offered by the runner; avoid reaching into private state.
   - `codegraph_trace` from a public entry to a side effect (DB, network, fs) → decide unit vs. integration test based on the real call path, not a guess.
   - `codegraph_files` with `**/*.test.ts` / `**/fixtures/**` / `**/test-utils*` → locate existing test helpers and fixtures to reuse instead of rewriting.
   - Fall back to Read/Grep only for non-TS assets (schemas, fixtures in JSON/YAML, docs) or to confirm a detail CodeGraph didn't surface.

2.5. **Third-party API verification (Context7)** — 若被测模块依赖第三方库（如 HTTP 框架、ORM、测试工具本身），用 Context7 确认其当前 API 行为，确保 mock 边界和断言与库的实际行为一致，而非依赖过时的认知。

3. **Generate the test file**
   - Place next to source using the discovered naming convention (e.g. `src/foo.ts` → `src/foo.test.ts`).
   - One `describe` per public export, one `it`/`test` per meaningful case.
   - Cover: happy path, boundary/empty inputs, error paths, and — for domain constants — at least one invariant (e.g. `TASK_STATUS` values round-trip, no duplicates).
   - No snapshot tests unless the existing package uses them.
   - No `any`, no `@ts-ignore`. Tests must pass `check-types`.

4. **Honor AGENTS.md**
   - Import domain values (task status, role, actor, message type, error code) from their canonical `constants/` modules — never hardcode string literals in assertions either.
   - If a new domain value is needed, extend the unified definition rather than inlining.

5. **Verify**
   - Run the package's test script (e.g. `pnpm turbo -F <pkg> test`) and confirm the new file passes.
   - Run `pnpm turbo -F <pkg> check-types` to confirm the test file type-checks.
   - Run `codegraph_callers` on the symbol(s) under test — if any real caller depends on a behavior the new test implicitly contracts out of (e.g. a return shape, error type, or ordering), flag it instead of silently asserting against it.
   - If either command fails, iterate (max 2 rounds); otherwise report the failure for human review.

## Guardrails

- Do not modify production code to "make it testable" unless explicitly asked — flag the seam instead.
- Do not generate tests for trivial re-exports, type-only files, or barrel `index.ts`.
- Do not generate redundant parameterized cases just to inflate counts.

## Output

End with:
- Created: `<test file path> — <N> tests covering <exports>`
- Skipped: `<source path> — <reason>` (for anything intentionally not covered)
- Issues: anything that needs human decisions (unmockable side effects, missing fixtures).
