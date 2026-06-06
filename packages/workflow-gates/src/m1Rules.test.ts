import assert from "node:assert/strict";
import test from "node:test";
import { checkM1Stop, isM1AllowedPath } from "./rules/m1.ts";

test("M1 allows business, workflow, configuration, and documentation paths", () => {
  for (const path of [
    "README.md",
    "apps/frontend/src/lib/opsApi.ts",
    "apps/backend/src/business/orders.ts",
    "packages/db/src/orders.ts",
    "packages/workflow-gates/src/preToolGuard.ts",
    "docs/workflows/agent-execution-workflow.md",
    ".agent/active-task.json",
    ".claude/settings.json",
    "observability/README.md",
  ]) {
    assert.equal(isM1AllowedPath(path), true, path);
  }
});

test("M1 rejects later-milestone and unrelated paths", () => {
  for (const path of [
    "observability/prometheus/prometheus.yml",
    "./observability/loki/loki-config.yaml",
    "observability/grafana/datasources/default.yml",
    "observability/otel/collector.yml",
    ".gitlab-ci.yml",
    "some-random-file.txt",
  ]) {
    assert.equal(isM1AllowedPath(path), false, path);
  }
});

test("M1 stop check runs the M0 base gate before type and test gates", () => {
  const events: string[] = [];

  checkM1Stop({
    checkBase: () => events.push("M0"),
    run: (command, args) => {
      events.push(`${command} ${args.join(" ")}`);
      return { ok: true, output: "" };
    },
  });

  assert.deepEqual(events, ["M0", "pnpm check-types", "pnpm test"]);
});

test("M1 stop check reports the exact failing command", () => {
  assert.throws(
    () => checkM1Stop({
      checkBase: () => undefined,
      run: (_command, args) => ({
        ok: args[0] !== "test",
        output: args[0] === "test" ? "test failed" : "",
      }),
      writeError: () => undefined,
      fail: (message) => {
        throw new Error(message);
      },
    }),
    /M1.*pnpm test failed/,
  );
});
