import type { CSSProperties, ReactElement, RefObject } from "react";

import { ChatIcon } from "#shared/assets/icons/panel-icons";

export type WidgetLauncherProps = {
  readonly launcherButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onOpen: () => void;
  readonly style?: CSSProperties;
};

export const WidgetLauncher = ({
  launcherButtonRef,
  onOpen,
  style,
}: WidgetLauncherProps): ReactElement => (
  <button
    ref={launcherButtonRef}
    type="button"
    aria-label="Open assistant"
    className="side-chat-launcher fixed right-5 bottom-5 z-40 inline-flex size-16 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-700 text-white shadow-[0_18px_44px_rgba(16,24,40,0.22)] transition hover:bg-emerald-800 focus:ring-4 focus:ring-emerald-200 focus:outline-none max-sm:right-3 max-sm:bottom-3 [&_svg]:size-8 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2"
    data-sidechat-launcher="true"
    onClick={onOpen}
    style={style}
  >
    <ChatIcon />
  </button>
);
