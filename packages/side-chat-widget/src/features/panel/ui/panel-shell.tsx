import type { HTMLAttributes, ReactElement, RefObject } from "react";

import { cn } from "#shared/lib/cn";
import type { PanelState } from "../model/panel-state.js";
import { panelId } from "../model/panel-geometry.js";
import { ResizeHandles, type ResizeHandlesProps } from "./resize-handles.js";

export type PanelShellProps = HTMLAttributes<HTMLElement> & {
  readonly panelRef?: RefObject<HTMLElement | null>;
  readonly onResizeStart?: ResizeHandlesProps["onResizeStart"];
  readonly state: PanelState;
};

export const PanelShell = ({
  children,
  className,
  panelRef,
  onResizeStart,
  state,
  style,
  ...props
}: PanelShellProps): ReactElement | null => {
  if (state.visibility === "closed") return null;
  const expanded = state.mode === "expanded";

  return (
    <aside
      ref={panelRef}
      id={panelId}
      aria-label="Side chat assistant"
      className={cn(
        "side-chat-widget fixed right-5 bottom-5 z-40 flex flex-col overflow-hidden border border-emerald-200 bg-white font-sans text-slate-950 shadow-[0_22px_60px_rgba(17,24,39,0.18)] max-sm:right-3 max-sm:bottom-3 max-sm:left-3 max-sm:h-[min(760px,calc(100vh-1.5rem))] max-sm:w-auto",
        expanded
          ? "inset-0 h-screen w-screen rounded-none border-0 shadow-none"
          : "max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] rounded-lg",
        state.visibility === "minimized" && "bottom-auto min-h-0",
        className,
      )}
      data-panel-mode={state.mode}
      data-panel-visibility={state.visibility}
      data-settings-open={state.settingsOpen}
      style={{
        ...style,
        width: expanded
          ? "100vw"
          : `min(${state.size.width}px, calc(100vw - 2rem))`,
        height: expanded
          ? "100vh"
          : `min(${state.size.height}px, calc(100vh - 2rem))`,
        transform: expanded
          ? "none"
          : `translate(${state.offset.x}px, ${state.offset.y}px)`,
      }}
      {...props}
    >
      {!expanded && onResizeStart ? (
        <ResizeHandles onResizeStart={onResizeStart} />
      ) : null}
      {children}
    </aside>
  );
};
