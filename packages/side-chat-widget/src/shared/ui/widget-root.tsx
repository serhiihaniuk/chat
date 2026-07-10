/**
 * Own the widget theme and the container used by popup portals.
 *
 * The root holds the widget's design tokens. Named themes set an attribute on
 * this element, so the theme applies to the root and all of its children.
 *
 * Base UI normally mounts popups under `document.body`, outside those tokens.
 * `usePortalContainer` gives each popup this root instead.
 *
 * The root is stored in state through a callback ref. State is needed because
 * descendants render before a plain ref has a usable element; the state update
 * gives later popups the real container.
 */
import { createContext, use, useState, type ComponentPropsWithoutRef } from "react";

import { cn } from "#shared/lib/cn";
import type { WidgetThemeId } from "#shared/lib/widget-themes";

// The root's theme prop is the canonical theme id union (see shared/lib/widget-themes).
export type ThemeName = WidgetThemeId;

const PortalContainerContext = createContext<HTMLElement | null>(null);

/** Returns the widget-root element to pass as `container={...}` to every Base UI Portal. */
export function usePortalContainer(): HTMLElement | null {
  return use(PortalContainerContext);
}

export function SideChatWidgetRoot({
  theme = "graphite",
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  theme?: ThemeName;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <div
      ref={setContainer}
      className={cn("side-chat-widget-root", className)}
      data-sidechat-theme={theme === "graphite" ? undefined : theme}
      {...props}
    >
      <PortalContainerContext.Provider value={container}>
        {children}
      </PortalContainerContext.Provider>
    </div>
  );
}
