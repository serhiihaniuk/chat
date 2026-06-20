/**
 * Demo for §9.10 — Error notice. Renders the REAL ErrorNotice on a muted surface,
 * once with a "Try again" retry and once as a bare advisory (no retry). Layout here
 * uses inline styles + widget tokens so it survives inside <Preview>'s shadow root.
 */
import { useState } from "react";

import { ErrorNotice } from "@side-chat/side-chat-widget/ui/error-notice";

export function ErrorDemo() {
  const [attempts, setAttempts] = useState(1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        width: "100%",
        maxWidth: "32rem",
      }}
    >
      <ErrorNotice
        message="The model failed to respond. Check your connection and try again."
        onRetry={() => setAttempts((n) => n + 1)}
      />
      <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
        Retry attempts: <code>{attempts}</code>
      </span>

      <ErrorNotice message="This conversation hit the context limit. Start a new chat to continue." />
    </div>
  );
}
