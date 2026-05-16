import { Bot } from "lucide-react";
import type { CSSProperties, RefObject } from "react";

import { panelId } from "../../domain/panel/panel-geometry.js";

export type WidgetLauncherProps = {
  appearanceVars: CSSProperties;
  launcherButtonRef: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
};

export const WidgetLauncher = ({
  appearanceVars,
  launcherButtonRef,
  onOpen,
}: WidgetLauncherProps) => (
  <button
    ref={launcherButtonRef}
    type="button"
    aria-label="Open assistant"
    aria-expanded={false}
    aria-controls={panelId}
    className="fixed right-6 bottom-6 z-50 inline-flex items-center gap-2.5 rounded-md border px-5 py-3 text-base font-semibold shadow-md shadow-slate-950/10 transition duration-150 focus:ring-2 focus:outline-none max-sm:right-4 max-sm:bottom-4 max-sm:text-sm [&_svg]:size-5"
    style={{
      ...appearanceVars,
      background: "var(--sidechat-bg)",
      borderColor: "var(--sidechat-accent)",
      boxShadow:
        "0 10px 24px rgb(15 23 42 / 0.12), 0 0 0 3px color-mix(in srgb, var(--sidechat-accent) 14%, transparent)",
      color: "var(--sidechat-fg)",
      outlineColor: "var(--sidechat-accent)",
    }}
    data-sidechat-root="true"
    onClick={onOpen}
  >
    <Bot aria-hidden="true" />
    How can I help?
  </button>
);
