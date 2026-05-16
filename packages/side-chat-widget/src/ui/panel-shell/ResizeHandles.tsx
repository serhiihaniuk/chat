import type { PointerEvent as ReactPointerEvent } from "react";

import type { ResizeHandle } from "../../domain/panel/panel-geometry.js";

export type ResizeHandlesProps = {
  onResizeStart: (
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

const resizeHandles: Array<{
  ariaLabel: string;
  className: string;
  handle: ResizeHandle;
}> = [
  {
    ariaLabel: "Resize assistant panel from top left",
    className:
      "absolute top-0 left-0 z-10 size-5 cursor-nwse-resize rounded-br-md border-r border-b border-slate-300 bg-white shadow-sm hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none max-sm:hidden",
    handle: "top-left",
  },
  {
    ariaLabel: "Resize assistant panel from top right",
    className:
      "absolute top-0 right-0 z-10 size-5 cursor-nesw-resize rounded-bl-md border-b border-l border-slate-300 bg-white shadow-sm hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none max-sm:hidden",
    handle: "top-right",
  },
  {
    ariaLabel: "Resize assistant panel from left edge",
    className:
      "absolute top-6 bottom-6 left-0 z-10 w-2 cursor-ew-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden",
    handle: "left",
  },
  {
    ariaLabel: "Resize assistant panel from right edge",
    className:
      "absolute top-6 right-0 bottom-6 z-10 w-2 cursor-ew-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden",
    handle: "right",
  },
  {
    ariaLabel: "Resize assistant panel height",
    className:
      "absolute top-0 right-6 left-6 z-10 h-2 cursor-ns-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden",
    handle: "top",
  },
  {
    ariaLabel: "Resize assistant panel from bottom edge",
    className:
      "absolute right-6 bottom-0 left-6 z-10 h-2 cursor-ns-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden",
    handle: "bottom",
  },
];

export const ResizeHandles = ({ onResizeStart }: ResizeHandlesProps) => (
  <>
    {resizeHandles.map((handle) => (
      <button
        key={handle.handle}
        type="button"
        aria-label={handle.ariaLabel}
        className={handle.className}
        onPointerDown={(event) => onResizeStart(handle.handle, event)}
      />
    ))}
  </>
);
