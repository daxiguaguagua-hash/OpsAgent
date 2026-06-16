import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (dsn) {
  // GlitchTip 不支持 sessions（M4-11 spike R3 验证）。
  // GlitchTip 官方文档推荐 `autoSessionTracking: false`，但 @sentry/react v9+ 已移除该选项；
  // 按 Sentry v8→v9 迁移指南，从默认 integrations 里过滤掉 browserSessionIntegration 即可。
  const integrations = Sentry.getDefaultIntegrations({}).filter(
    (i) => i.name !== "BrowserSession",
  );
  integrations.push(Sentry.browserTracingIntegration(), Sentry.replayIntegration());

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION ?? "dev",
    integrations,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export { Sentry };
