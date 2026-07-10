"use client";

/**
 * §8.16 — Link-safety confirmation for every external link.
 *
 * Markdown links and citation rows use this same dialog before opening a URL.
 * The widget owns the dialog instead of Streamdown, so it stays inside the
 * widget's theme and uses the widget's localized labels.
 *
 * Show the exact destination URL because link text can be misleading. The user
 * can copy the URL or open it; `onConfirm` performs the actual navigation.
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
