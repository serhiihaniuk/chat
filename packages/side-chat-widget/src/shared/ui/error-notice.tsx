/**
 * Error notice.
 *
 * A turn that failed to complete, shown on a MUTED surface — not a full-red panel.
 * The only red is the leading glyph, tinted via the `sc-error-glyph` hook class
 * (destructive mixed into muted — there is NO destructive-foreground, semantic colors). Body
 * copy stays tier-1 (text-foreground). The secondary "Try again" uses the shared
 * Button variant so its muted fill follows the same theme token as every secondary action.
 */
import { type ReactElement } from "react";
import { RotateCcw, ShieldAlert, TriangleAlert } from "lucide-react";

import { useWidgetLabels } from "#shared/lib/widget-labels";
import { Button } from "#shared/ui/button";

function ErrorNotice({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}): ReactElement {
  const labels = useWidgetLabels();
  return (
    <div
      data-slot="error-notice"
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3"
    >
      <TriangleAlert className="sc-error-glyph mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-foreground">{message ?? labels.noticeError}</p>
        {onRetry ? (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry} className="mt-2">
            <RotateCcw className="size-3.5" />
            {labels.noticeRetry}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Blocked notice — a turn stopped by safety filtering.
 *
 * Same muted surface as the error notice, but a NEUTRAL guard glyph (no red) and,
 * crucially, no "Try again": a content-filtered turn must not invite resubmission
 * of the same input. `role="status"` (not `alert`) keeps the tone calm.
 */
function BlockedNotice({ message }: { message: string }): ReactElement {
  return (
    <div
      data-slot="blocked-notice"
      role="status"
      className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3"
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 text-sm text-foreground">{message}</p>
    </div>
  );
}

export { BlockedNotice, ErrorNotice };
