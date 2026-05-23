import type { HTMLAttributes, ReactElement } from "react";

import { cn } from "#shared/lib/cn";
import type { PanelState } from "../model/panel-state.js";

export type PanelShellProps = HTMLAttributes<HTMLElement> & {
  readonly state: PanelState;
};

export const PanelShell = ({
  className,
  state,
  ...props
}: PanelShellProps): ReactElement | null => {
  if (state.visibility === "closed") return null;

  return (
    <section
      className={cn(
        "side-chat-widget fixed top-[52px] right-[26px] bottom-9 z-40 flex min-h-[620px] w-[min(1180px,calc(100vw-52px))] min-w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-emerald-200 bg-white font-sans text-slate-950 shadow-[0_22px_60px_rgba(17,24,39,0.18)] max-[720px]:inset-2.5 max-[720px]:h-auto max-[720px]:min-h-0 max-[720px]:w-auto max-[720px]:min-w-0",
        state.mode === "expanded" &&
          "top-6 right-6 bottom-6 left-6 w-auto max-w-none",
        state.visibility === "minimized" && "bottom-auto min-h-0",
        className,
      )}
      data-panel-mode={state.mode}
      data-panel-visibility={state.visibility}
      data-settings-open={state.settingsOpen}
      {...props}
    />
  );
};
