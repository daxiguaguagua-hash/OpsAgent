---
name: library-upgrade
description: Safely upgrade third-party dependencies by combining Context7 migration guides with CodeGraph impact analysis. Use when the user says "upgrade X", "bump version", "migrate to vN", or asks to update a library dependency.
disable-model-invocation: true
---

# Library Upgrade

Guided dependency upgrade workflow: Context7 for migration intel, CodeGraph for blast-radius analysis, then systematic code updates.

## Input

`$ARGUMENTS` may be:
- A library name and target version (e.g. `hono@4`, `vitest@3`)
- A library name only (upgrade to latest)
- `all` (scan `package.json` for outdated deps and prioritize)

## Workflow

1. **Identify the upgrade target**
   - Parse library name and target version from input.
   - If no version given, check `npm view <lib> version` for latest.
   - Read the current version from the relevant `package.json` (root catalog or package-level).
   - If `all`, run `pnpm outdated` and present the list; let the user pick which to upgrade.

2. **Migration intel (Context7)**
   - Use Context7 `resolve_library_id` to find the library, then `query_docs` for:
     - Migration guide / changelog between current and target version
     - Breaking changes, deprecated APIs, new required config
     - New features that could simplify existing code (opportunistic improvements)
   - Summarize findings as a checklist of required code changes before touching any file.

3. **Blast-radius analysis (CodeGraph)**
   - `codegraph_search` for all imports of the target library across the monorepo.
   - `codegraph_impact` on each imported symbol to see downstream consumers.
   - Cross-reference the Context7 breaking-changes list against actual usage:
     - Which imported APIs are affected?
     - How many call sites need updating?
     - Are there transitive impacts (callers of callers)?
   - Produce a change plan: file list, affected symbols, estimated effort.

4. **Apply changes**
   - Update `package.json` (use `catalog:` reference if the dep is in `pnpm-workspace.yaml`).
   - Run `pnpm install` to resolve the new version.
   - Apply code changes per the migration checklist, starting from leaf modules (fewest dependents) and working inward.
   - For each modified symbol, run `codegraph_callers` to update all call sites in the same pass.
   - Follow `AGENTS.md`: no hardcoded domain strings; import from canonical constants.

5. **Verify**
   - Run the full diagnostic pipeline: `pnpm turbo build`, `check-types`, `test`.
   - If failures occur, use the auto-fix-issues skill or fix manually (max 3 iterations).
   - Run `codegraph_impact` on any newly added or renamed symbols to confirm nothing was missed.

6. **Report**
   - Library: `<name> <old> → <new>`
   - Changed: `<file>:<line> — <what changed and why (breaking change ref)>`
   - Verified: build / types / test pass status
   - Skipped: any known issues or caveats that need manual review

## Guardrails

- Do not upgrade multiple unrelated libraries in one pass unless the user explicitly asks — isolate breakages.
- Do not opportunistically refactor unrelated code during an upgrade.
- If the migration guide reveals a fundamental architecture change (e.g., ESM-only drop, new runtime requirement), **stop and report** before applying.
- If `pnpm install` produces peer dependency conflicts across the monorepo, report and ask before forcing resolution.
- Respect `AGENTS.md`: catalog references for shared deps, no hardcoded domain strings.
