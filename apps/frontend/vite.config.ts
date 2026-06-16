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
  // 把 releaseName 注入到 import.meta.env.VITE_APP_VERSION，让浏览器端
  // Sentry.init({ release }) 与 @sentry/vite-plugin 上传 sourcemap 时
  // 使用的 release.name 完全一致（Sentry 官方文档明确要求两者严格相等，
  // 否则 stacktrace 无法被 sourcemap 反解 —— 详见 Sentry sourcemaps 文档
  // "the release property in Sentry.init() must match the plugin's release.name
  // or be removed entirely"）。
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(releaseName),
  },
  build: {
    // 必须 true（不能用 "hidden"）：GlitchTip legacy 模式靠 JS 文件里的
    // sourceMappingURL 注释找到对应的 .map artifact；"hidden" 不写这条注释，
    // 服务端拿到 JS artifact 也找不到 map，sourcemap 反解失败。
    // dist/ 目录本身不会通过 web server 暴露给浏览器，map 文件只存在于
    // GlitchTip release artifact 里，不会泄漏到生产环境。
    sourcemap: true,
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
            release: {
              name: releaseName,
              // GlitchTip 服务端不支持 debug-id artifact bundle 解析
              // （默认模式上传的文件名是 <uuid>.js，与 stack frame URL 对不上，
              // 导致 sourcemap 永远不反解）。改用 legacy 模式，每个 .js / .js.map
              // 单独上传为 ~/assets/xxx.js 风格的 URL 命名 artifact，
              // 让 GlitchTip 能按 frame.absPath 命中对应的 map。
              uploadLegacySourcemaps: {
                paths: ["./dist/assets"],
                urlPrefix: "~/assets",
              },
            },
          }),
        ]
      : []),
  ],
});
