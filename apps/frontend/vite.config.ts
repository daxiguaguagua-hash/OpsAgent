import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const frontendPackageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

function getGitShortSha(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

// 显式从 frontend/.env 加载 SENTRY_* 凭证（override: true 覆盖父 shell 的同名空变量）
// 不能用 Vite 的 loadEnv：它默认 override:false，会被父 shell 的空 SENTRY_AUTH_TOKEN 挡住
// 不能用 @opsagent/env：它在 vite.config.ts 上下文中会触发 repo-root.js 模块解析错误
dotenv.config({ override: true, path: path.resolve(process.cwd(), ".env") });

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || undefined;
const sentryOrg = process.env.SENTRY_ORG || undefined;
const sentryProject = process.env.SENTRY_PROJECT || undefined;
const sentryUrl = process.env.SENTRY_URL || "https://sentry.io";
const gitSha = getGitShortSha();
const releaseName = gitSha
  ? `${frontendPackageJson.version}-${gitSha}`
  : frontendPackageJson.version;

if (!sentryAuthToken) {
  console.warn(
    "[vite] SENTRY_AUTH_TOKEN 未配置，跳过 @sentry/vite-plugin（Source Map 不会上传到 Sentry）。" +
      " 详见 ADR-0006 / docs/milestones/M4/tasks/M4-04-sentry-release-sourcemap-upload.md",
  );
}

export default defineConfig({
  server: {
    port: 3001,
  },
  envDir: "../..",
  build: {
    sourcemap: "hidden",
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    ...(sentryAuthToken && sentryOrg && sentryProject
      ? [
          sentryVitePlugin({
            url: sentryUrl,
            org: sentryOrg,
            project: sentryProject,
            authToken: sentryAuthToken,
            release: { name: releaseName },
            sourcemaps: {
              assets: ["./dist/assets/**"],
            },
          }),
        ]
      : []),
  ],
});
