/**
 * §9.10 — Error notice.
 *
 * A turn that failed to complete, shown on a MUTED surface — not a full-red panel.
 * The only red is the leading glyph, tinted via the `sc-error-glyph` hook class
 * (destructive mixed into muted — there is NO destructive-foreground, §7.6). Body
 * copy stays tier-1 (text-foreground). The secondary "Try again" is a plain
 * <button>, so `hover:`/`focus-visible:` are allowed here (gate G4 forbids those
 * only on Base UI parts); pressing it re-runs the same turn.
 */
import { useState, type ReactElement } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { cn } from "#shared/lib/cn";

function ErrorNotice({
  message = "Something went wrong while generating a response.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}): ReactElement {
  return (
    <div
      data-slot="error-notice"
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3"
    >
      <TriangleAlert className="sc-error-glyph mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-foreground">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
              "text-sm font-medium text-foreground",
              "bg-card border border-border hover:bg-accent",
              "focus-visible:outline-2 focus-visible:outline-ring",
            )}
          >
            <RotateCcw className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorNoticeSection(): ReactElement {
  const [attempts, setAttempts] = useState(1);

  return (
    <div className="flex w-full max-w-measure-message flex-col gap-2">
      <ErrorNotice
        message="The model failed to respond. Check your connection and try again."
        onRetry={() => setAttempts((n) => n + 1)}
      />
      <p className="text-2xs text-muted-foreground">Retry attempts: {attempts}</p>
    </div>
  );
}

export { ErrorNotice };
