import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
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

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || undefined;
const sentryOrg = process.env.SENTRY_ORG || undefined;
const sentryProject = process.env.SENTRY_PROJECT || undefined;
const releaseName = getGitShortSha()
  ? `${frontendPackageJson.version}-${getGitShortSha()}`
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
