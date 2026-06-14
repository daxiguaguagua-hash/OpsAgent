import { ErrorBoundary } from "@sentry/react";
import type { ReactElement, ReactNode } from "react";

function Fallback({ eventId }: { eventId: string | null }): ReactElement {
  return (
    <div
      role="alert"
      style={{
        padding: "2rem",
        maxWidth: "40rem",
        margin: "4rem auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.25rem" }}>Something went wrong</h1>
      <p style={{ color: "#666" }}>
        The error has been reported.
        {eventId && <> Event ID: <code>{eventId}</code></>}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Reload
      </button>
    </div>
  );
}

export default function AppErrorBoundary({ children }: { children: ReactNode }): ReactElement {
  return <ErrorBoundary fallback={Fallback}>{children}</ErrorBoundary>;
}
