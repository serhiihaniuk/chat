/**
 * Dialog: a modal kept inside the widget panel.
 *
 * Base UI `Dialog` portals the backdrop and popup into `usePortalContainer()`.
 * Absolute positioning keeps the modal over the widget, not over the host page,
 * and lets the backdrop follow the panel's rounded corners. `styles.css` owns
 * the surface and positioning through the `dialog-backdrop` and `dialog-content`
 * slots; JSX only supplies those slot names.
 *
 * This component is controlled only. The widget opens it from flows such as a
 * clicked Markdown link or a destructive-action confirmation, so it has
 * `open`/`onOpenChange` but no local Trigger part.
 */
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { useWidgetLabels } from "#shared/lib/widget-labels";
import { usePortalContainer } from "#shared/ui/widget-root";

export function WidgetDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children?: ReactNode;
}): ReactElement {
  const container = usePortalContainer();
  const labels = useWidgetLabels();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop data-slot="dialog-backdrop" />
        <Dialog.Popup data-slot="dialog-content">
          <div className="flex items-start gap-2">
            <Dialog.Title className="flex-1 text-md font-semibold text-foreground">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label={labels.dialogClose}
              className="sc-icon-btn -mt-1 -mr-1 shrink-0"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
              {description}
            </Dialog.Description>
          ) : null}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
