import { readFileSync } from "node:fs";
import { block } from "../lib/io.ts";
import { fileExists, isGitTracked, runCommand } from "../lib/repo.ts";

const requiredDirectories = [
  "apps/frontend",
  "apps/backend",
  "apps/agent",
  "packages/shared",
  "observability",
  "docs",
];

const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "docker-compose.yml",
  ".gitignore",
  ".env.example",
  "CODEOWNERS",
  "docs/team-ownership.md",
  "docs/codegraph.md",
];

export function isM0AllowedPath(path: string): boolean {
  return [
    "README.md",
    "package.json",
    "pnpm-workspace.yaml",
    "turbo.json",
    "docker-compose.yml",
    ".gitignore",
    ".env.example",
    "CODEOWNERS",
  ].some((allowed) => path === allowed || path === `./${allowed}`)
    || ["docs/", "./docs/", "apps/", "./apps/", "packages/", "./packages/", "observability/", "./observability/", ".claude/", "./.claude/"].some((prefix) =>
      path.startsWith(prefix),
    );
}

export function checkM0Stop(): void {
  for (const dir of requiredDirectories) {
    if (!fileExists(dir)) {
      block(`OpsAgent Stop hook blocked: missing required directory: ${dir}`);
    }
  }

  for (const file of requiredFiles) {
    if (!fileExists(file)) {
      block(`OpsAgent Stop hook blocked: missing required file: ${file}`);
    }
  }

  const readme = fileExists("README.md") ? BunlessReadFile("README.md") : "";
  if (!readme.includes("docs/issues/M0-project-scaffold.md")) {
    block("OpsAgent Stop hook blocked: README.md must link to M0 document");
  }
  if (!readme.includes("docs/team-ownership.md")) {
    block("OpsAgent Stop hook blocked: README.md must link to team ownership document");
  }
  if (!readme.includes("docs/codegraph.md")) {
    block("OpsAgent Stop hook blocked: README.md must link to CodeGraph document");
  }

  const workspace = BunlessReadFile("pnpm-workspace.yaml");
  if (!workspace.includes("apps/*")) {
    block("OpsAgent Stop hook blocked: pnpm-workspace.yaml must include apps/*");
  }
  if (!workspace.includes("packages/*")) {
    block("OpsAgent Stop hook blocked: pnpm-workspace.yaml must include packages/*");
  }

  if (isGitTracked(".env")) {
    block("OpsAgent Stop hook blocked: .env must not be tracked by git");
  }

  const compose = runCommand("docker", ["compose", "config"]);
  if (!compose.ok) {
    process.stderr.write(compose.output);
    block("OpsAgent Stop hook blocked: docker compose config failed");
  }

  const build = runCommand("pnpm", ["build"]);
  if (!build.ok) {
    process.stderr.write(build.output);
    block("OpsAgent Stop hook blocked: pnpm build failed");
  }
}

function BunlessReadFile(path: string): string {
  return fileExists(path) ? readFileSync(path, "utf8") : "";
}
