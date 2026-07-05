/**
 * Floating panel chrome for the live widget.
 *
 * This component keeps rendering concerns local: themed root, fixed/absolute
 * placement, and invisible resize handles. The drag session math lives beside it in
 * resizable-panel-resize.ts so the pointer lifecycle can be tested separately.
 */
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cn } from "#shared/lib/cn";
import { SideChatWidgetRoot, type ThemeName } from "#shared/ui/widget-root";
import { useIsMobile } from "../model/use-is-mobile.js";
import {
  createResizeSession,
  sizeStyle,
  usePanelResizeEvents,
  type Anchor,
  type Offset,
  type ResizablePanelSize,
  type ResizeSession,
  type ResizeHandle,
} from "./resizable-panel-resize.js";

export { calculateResizedPanel } from "./resizable-panel-resize.js";

const HANDLES: readonly { handle: ResizeHandle; ariaLabel: string; className: string }[] = [
  {
    handle: "top-left",
    ariaLabel: "Resize panel from top left",
    className:
      "absolute top-0 left-0 z-[80] size-4 cursor-nwse-resize bg-transparent focus:outline-none max-sm:hidden",
  },
  {
    handle: "top-right",
    ariaLabel: "Resize panel from top right",
    className:
      "absolute top-0 right-0 z-[80] size-4 cursor-nesw-resize bg-transparent focus:outline-none max-sm:hidden",
  },
  {
    handle: "left",
    ariaLabel: "Resize panel from left edge",
    className:
      "absolute top-4 bottom-4 left-0 z-[80] w-2 cursor-ew-resize bg-transparent focus:outline-none max-sm:hidden",
  },
  {
    handle: "right",
    ariaLabel: "Resize panel from right edge",
    className:
      "absolute top-4 right-0 bottom-4 z-[80] w-2 cursor-ew-resize bg-transparent focus:outline-none max-sm:hidden",
  },
  {
    handle: "top",
    ariaLabel: "Resize panel from top edge",
    className:
      "absolute top-0 right-4 left-4 z-[80] h-2 cursor-ns-resize bg-transparent focus:outline-none max-sm:hidden",
  },
  {
    handle: "bottom",
    ariaLabel: "Resize panel from bottom edge",
    className:
      "absolute right-4 bottom-0 left-4 z-[80] h-2 cursor-ns-resize bg-transparent focus:outline-none max-sm:hidden",
  },
];

export function ResizablePanel({
  anchor = "fixed",
  defaultSize,
  theme = "graphite",
  className,
  onSizeChange,
  style,
  children,
  ...rootProps
}: {
  anchor?: Anchor;
  defaultSize?: ResizablePanelSize | undefined;
  theme?: ThemeName;
  className?: string;
  onSizeChange?: ((size: ResizablePanelSize) => void) | undefined;
  style?: CSSProperties;
  children: ReactNode;
} & Omit<React.ComponentPropsWithoutRef<"div">, "style" | "className" | "children">) {
  const isMobile = useIsMobile();
  const [size, setSize] = useState<ResizablePanelSize>(
    () => defaultSize ?? { width: 640, height: 760 },
  );
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const session = useRef<ResizeSession | null>(null);
  const commitSize = useCallback(
    (nextSize: ResizablePanelSize): void => {
      setSize(nextSize);
      onSizeChange?.(nextSize);
    },
    [onSizeChange],
  );
  usePanelResizeEvents(session, commitSize, setOffset);

  const startResize = useCallback(
    (handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (event.button !== 0) return;
      const panel = event.currentTarget.closest(".side-chat-widget-root");
      if (!(panel instanceof HTMLElement)) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      session.current = createResizeSession({ anchor, event, handle, offset, panel, size });
    },
    [anchor, offset, size],
  );

  return (
    <SideChatWidgetRoot
      className={cn(
        "sc-widget-panel z-50 flex flex-col overflow-hidden border border-border bg-card text-foreground shadow-(--shadow-panel)",
        // Below the mobile breakpoint the panel is a full-width bottom sheet that
        // slides up; above it, the floating card the user can drag-resize.
        isMobile
          ? "sc-widget-sheet fixed inset-x-0 bottom-0 rounded-t-2xl border-b-0"
          : cn(
              "rounded-xl",
              anchor === "fixed" ? "fixed right-4 bottom-4" : "absolute right-4 bottom-4",
            ),
        className,
      )}
      style={isMobile ? sheetStyle(style) : { ...style, ...sizeStyle(size, offset, anchor) }}
      theme={theme}
      {...rootProps}
    >
      {/* Resize is a desktop-only affordance; the sheet is sized by the viewport. */}
      {isMobile
        ? null
        : HANDLES.map((handle) => (
            <button
              aria-label={handle.ariaLabel}
              className={handle.className}
              key={handle.handle}
              onPointerDown={(event) => startResize(handle.handle, event)}
              type="button"
            />
          ))}
      {children}
    </SideChatWidgetRoot>
  );
}

// The mobile sheet ignores the dragged width/height: it fills the viewport width and
// stands ~85% tall, preserving the caller's appearance tokens carried on `style`.
const sheetStyle = (style: CSSProperties | undefined): CSSProperties => ({
  ...style,
  height: "85dvh",
  maxHeight: "85dvh",
});
