import { Button, IconButton } from "#shared/ui/button";
import { PlusIcon, SettingsIcon, XIcon } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type { SideChatWidgetPanelSize } from "#entities/panel";
import type { ResizeHandle } from "../model/widget-resize.js";

export const toPanelStyle = (
  panelSize: SideChatWidgetPanelSize,
  panelOffset: { readonly x: number; readonly y: number },
): CSSProperties => ({
  height: panelSize.height,
  transform: `translate(${panelOffset.x}px, ${panelOffset.y}px)`,
  width: panelSize.width,
  willChange: "transform",
});

// Invisible drag zones at the panel edges/corners — no visible chrome, matching the
// mock. They only set the resize cursor on hover.
const resizeHandles: readonly {
  readonly ariaLabel: string;
  readonly className: string;
  readonly handle: ResizeHandle;
}[] = [
  {
    ariaLabel: "Resize assistant panel from top left",
    className:
      "absolute top-0 left-0 z-10 size-4 cursor-nwse-resize bg-transparent focus:outline-none max-sm:hidden",
    handle: "top-left",
  },
  {
    ariaLabel: "Resize assistant panel from top right",
    className:
      "absolute top-0 right-0 z-10 size-4 cursor-nesw-resize bg-transparent focus:outline-none max-sm:hidden",
    handle: "top-right",
  },
  {
    ariaLabel: "Resize assistant panel from left edge",
    className:
      "absolute top-4 bottom-4 left-0 z-10 w-2 cursor-ew-resize bg-transparent focus:outline-none max-sm:hidden",
    handle: "left",
  },
  {
    ariaLabel: "Resize assistant panel from right edge",
    className:
      "absolute top-4 right-0 bottom-4 z-10 w-2 cursor-ew-resize bg-transparent focus:outline-none max-sm:hidden",
    handle: "right",
  },
  {
    ariaLabel: "Resize assistant panel height",
    className:
      "absolute top-0 right-4 left-4 z-10 h-2 cursor-ns-resize bg-transparent focus:outline-none max-sm:hidden",
    handle: "top",
  },
  {
    ariaLabel: "Resize assistant panel from bottom edge",
    className:
      "absolute right-4 bottom-0 left-4 z-10 h-2 cursor-ns-resize bg-transparent focus:outline-none max-sm:hidden",
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
  <Button className="fixed right-4 bottom-4 z-50 gap-2 shadow-lg" onClick={onOpen} type="button">
    {label}
  </Button>
);

// The leading title region is a plain title (wide mode, where the sidebar is the
// conversation switcher) or a caller-supplied switcher control (narrow mode); both
// carry their own agent-mark tile. Right side: settings, new chat, close.
export const WidgetHeader = ({
  onClose,
  onNewConversation,
  newConversationDisabled = false,
  onOpenSettings,
  title,
}: {
  readonly onClose: () => void;
  readonly onNewConversation: () => void;
  readonly newConversationDisabled?: boolean | undefined;
  readonly onOpenSettings: () => void;
  readonly title: ReactNode;
}) => (
  <header className="sc-header">
    <div className="flex min-w-0 flex-1 items-center">{title}</div>
    <IconButton aria-label="Settings" onClick={onOpenSettings} type="button">
      <SettingsIcon className="size-4" />
    </IconButton>
    <IconButton
      aria-label="Start new chat"
      disabled={newConversationDisabled}
      onClick={onNewConversation}
      title="Start new chat"
      type="button"
    >
      <PlusIcon className="size-4" />
    </IconButton>
    <IconButton aria-label="Close" onClick={onClose} type="button">
      <XIcon className="size-4" />
    </IconButton>
  </header>
);
