"use client";

/**
 * §8.16 — Link-safety confirm.
 *
 * The one interstitial for every external jump the widget makes: the assistant's
 * Markdown links (Streamdown intercepts the click and passes its own `onConfirm`)
 * and the citation fold's source rows (which pass `openExternalUrl`). The widget's
 * own §8.16 dialog, not Streamdown's built-in modal, so the confirm renders inside
 * the token scope and localizes with the rest of the widget.
 *
 * It only presents the jump: the destination URL verbatim — link text can lie, the
 * href cannot — plus copy-instead and open actions. `onConfirm` performs the open.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { Check, Copy, ExternalLink } from "lucide-react";

import { useWidgetLabels } from "#shared/lib/widget-labels";
import { Button } from "#shared/ui/button";
import { WidgetDialog } from "#shared/ui/dialog";

const COPIED_RESET_MS = 2_000;

/** Open an external URL in a new tab with the safe rel — the confirm's open action. */
export const openExternalUrl = (url: string): void => {
  window.open(url, "_blank", "noopener,noreferrer");
};

export function LinkSafetyDialog({
  isOpen,
  onClose,
  onConfirm,
  url,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  url: string;
}): ReactElement {
  const labels = useWidgetLabels();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard unavailable (permissions, insecure context): the URL stays
      // visible in the dialog for manual selection, so no error surface needed.
    }
  }, [url]);

  return (
    <WidgetDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={labels.linkSafetyTitle}
      description={labels.linkSafetyDescription}
    >
      <p className="mt-3 break-all rounded-md border border-border bg-muted px-2.5 py-2 text-xs text-muted-foreground">
        {url}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => void copyUrl()}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? labels.linkSafetyCopied : labels.linkSafetyCopy}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          <ExternalLink className="size-3.5" />
          {labels.linkSafetyOpen}
        </Button>
      </div>
    </WidgetDialog>
  );
}
