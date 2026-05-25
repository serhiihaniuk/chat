import { Button } from "#shared/ui/button";
import { XIcon } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import type { ResizeHandle } from "./widget-resize.js";
import type { SideChatWidgetPanelSize } from "./widget.types.js";

export const toPanelStyle = (
  panelSize: SideChatWidgetPanelSize,
  panelOffset: { readonly x: number; readonly y: number },
): CSSProperties => ({
  height: panelSize.height,
  transform: `translate(${panelOffset.x}px, ${panelOffset.y}px)`,
  width: panelSize.width,
  willChange: "transform",
});

const resizeHandles: readonly {
  readonly ariaLabel: string;
  readonly className: string;
  readonly handle: ResizeHandle;
}[] = [
  {
    ariaLabel: "Resize assistant panel from top left",
    className:
      "absolute top-0 left-0 z-10 size-5 cursor-nwse-resize rounded-br-md border-r border-b border-border bg-background shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 max-sm:hidden",
    handle: "top-left",
  },
  {
    ariaLabel: "Resize assistant panel from top right",
    className:
      "absolute top-0 right-0 z-10 size-5 cursor-nesw-resize rounded-bl-md border-b border-l border-border bg-background shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 max-sm:hidden",
    handle: "top-right",
  },
  {
    ariaLabel: "Resize assistant panel from left edge",
    className:
      "absolute top-6 bottom-6 left-0 z-10 w-2 cursor-ew-resize hover:bg-accent/20 focus:bg-accent/20 focus:outline-none max-sm:hidden",
    handle: "left",
  },
  {
    ariaLabel: "Resize assistant panel from right edge",
    className:
      "absolute top-6 right-0 bottom-6 z-10 w-2 cursor-ew-resize hover:bg-accent/20 focus:bg-accent/20 focus:outline-none max-sm:hidden",
    handle: "right",
  },
  {
    ariaLabel: "Resize assistant panel height",
    className:
      "absolute top-0 right-6 left-6 z-10 h-2 cursor-ns-resize hover:bg-accent/20 focus:bg-accent/20 focus:outline-none max-sm:hidden",
    handle: "top",
  },
  {
    ariaLabel: "Resize assistant panel from bottom edge",
    className:
      "absolute right-6 bottom-0 left-6 z-10 h-2 cursor-ns-resize hover:bg-accent/20 focus:bg-accent/20 focus:outline-none max-sm:hidden",
    handle: "bottom",
  },
];

export const ResizeHandles = ({
  onResizeStart,
}: {
  readonly onResizeStart: (
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
}) => (
  <>
    {resizeHandles.map((handle) => (
      <button
        aria-label={handle.ariaLabel}
        className={handle.className}
        key={handle.handle}
        onPointerDown={(event) => onResizeStart(handle.handle, event)}
        type="button"
      />
    ))}
  </>
);

export const ClosedWidgetLauncher = ({
  label,
  onOpen,
}: {
  readonly label: string;
  readonly onOpen: () => void;
}) => (
  <Button className="fixed right-4 bottom-4 z-50 shadow-lg" onClick={onOpen} type="button">
    {label}
  </Button>
);

export const WidgetHeader = ({
  onClose,
  title,
}: {
  readonly onClose: () => void;
  readonly title: string;
}) => (
  <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
    <div className="min-w-0">
      <h2 className="truncate font-medium text-sm">{title}</h2>
    </div>
    <div className="flex items-center gap-1">
      <Button aria-label="Close" onClick={onClose} size="icon-sm" type="button" variant="ghost">
        <XIcon className="size-4" />
      </Button>
    </div>
  </header>
);
