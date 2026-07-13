/**
 * Message actions.
 *
 * Ghost icon+label buttons under a COMPLETED assistant answer. All styling lives in
 * the `sc-action` hook class (ghost background, hover, the `&[data-copied]` success
 * colour swap). Copy flips to a transient "Copied" success state on the SAME button
 * for ~1.3s, then reverts; Retry re-runs the turn.
 */
import { useEffect, useRef, useState, type ReactElement } from "react";

import { Check, Copy, RotateCcw } from "lucide-react";

const COPIED_MS = 1300;

export function MessageActions({
  copyText,
  onCopy,
  onRetry,
}: {
  readonly copyText?: string | undefined;
  readonly onCopy?: (() => void) | undefined;
  readonly onRetry?: (() => void) | undefined;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const isDemo = copyText === undefined && onCopy === undefined && onRetry === undefined;
  const showCopied = (): void => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };
  const handleCopy = (): void => {
    if (onCopy) {
      onCopy();
      showCopied();
      return;
    }
    if (copyText === undefined || !navigator.clipboard) return;
    void navigator.clipboard.writeText(copyText).then(showCopied, () => undefined);
  };

  return (
    <div className="flex items-center gap-1">
      {isDemo || copyText !== undefined || onCopy !== undefined ? (
        <button className="sc-action" data-copied={copied ? true : undefined} onClick={handleCopy}>
          {copied ? (
            <>
              <Check /> Copied
            </>
          ) : (
            <>
              <Copy /> Copy
            </>
          )}
        </button>
      ) : null}
      {isDemo || onRetry !== undefined ? (
        <button className="sc-action" onClick={onRetry}>
          <RotateCcw /> Retry
        </button>
      ) : null}
    </div>
  );
}
