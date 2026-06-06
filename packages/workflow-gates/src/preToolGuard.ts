import { block, readStdin } from "./lib/io.ts";
import { extractPaths, parseHookPayload } from "./lib/hookPayload.ts";
import { baseName, readActiveGoal } from "./lib/repo.ts";
import { isM0AllowedPath } from "./rules/m0.ts";

const payload = parseHookPayload(readStdin());
const paths = extractPaths(payload);

for (const path of paths) {
  const name = baseName(path);
  if (
    name === ".env"
    || name.endsWith(".pem")
    || name.endsWith(".key")
    || name.endsWith(".p12")
    || name.endsWith(".pfx")
    || name === "id_rsa"
    || name === "id_ed25519"
  ) {
    block(`OpsAgent hook blocked: do not write secrets or private key files (${path})`);
  }
}

const command = payload.tool_input?.command ?? "";
if (payload.tool_name === "Bash" && command) {
  const destructivePatterns = [
    "git reset --hard",
    "git clean -fd",
    "git checkout --",
    "rm -rf",
    "docker compose down -v",
    "docker volume rm",
  ];

  if (destructivePatterns.some((pattern) => command.includes(pattern)) && process.env.OPSAGENT_ALLOW_DESTRUCTIVE !== "1") {
    block(`OpsAgent hook blocked: destructive command requires explicit human approval: ${command}`);
  }
}

if (readActiveGoal() === "M0") {
  for (const path of paths) {
    if (!isM0AllowedPath(path)) {
      block(`OpsAgent hook blocked: M0 active-goal only allows project scaffold paths, got: ${path}`);
    }
  }
}
