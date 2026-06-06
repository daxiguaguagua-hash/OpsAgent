import { block } from "../lib/io.ts";
import { runCommand } from "../lib/repo.ts";
import { checkM0Stop, isM0AllowedPath } from "./m0.ts";

interface CommandResult {
  ok: boolean;
  output: string;
}

interface M1StopDependencies {
  checkBase?: () => void;
  run?: (command: string, args: string[]) => CommandResult;
  writeError?: (output: string) => void;
  fail?: (message: string) => never;
}

const M2_BLOCKED_PREFIXES = [
  "observability/prometheus",
  "observability/loki",
  "observability/grafana",
  "observability/otel",
  "./observability/prometheus",
  "./observability/loki",
  "./observability/grafana",
  "./observability/otel",
];

const M5_BLOCKED_PATHS = new Set([
  ".gitlab-ci.yml",
  "./.gitlab-ci.yml",
]);

export function isM1AllowedPath(path: string): boolean {
  if (M2_BLOCKED_PREFIXES.some((p) => path.startsWith(p))) {
    return false;
  }

  if (M5_BLOCKED_PATHS.has(path)) {
    return false;
  }

  return (
    isM0AllowedPath(path)
    || path.startsWith(".agent/")
    || path.startsWith("./.agent/")
  );
}

export function checkM1Stop(dependencies: M1StopDependencies = {}): void {
  const checkBase = dependencies.checkBase ?? checkM0Stop;
  const run = dependencies.run ?? runCommand;
  const writeError = dependencies.writeError
    ?? ((output: string) => process.stderr.write(output));
  const fail = dependencies.fail ?? block;

  checkBase();

  for (const [label, args] of [
    ["pnpm check-types", ["check-types"]],
    ["pnpm test", ["test"]],
  ] as const) {
    const result = run("pnpm", [...args]);
    if (!result.ok) {
      writeError(result.output);
      fail(`OpsAgent Stop hook blocked (M1): ${label} failed`);
    }
  }
}
