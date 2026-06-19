/**
 * §3 — Root, theme & portal contract.
 *
 * The widget root owns the tier-1 + tier-2 tokens (via the `.side-chat-widget-root`
 * class and the `data-sidechat-theme` attribute) and is the portal target every
 * popup must mount into. Graphite is the base `:root` contract and therefore carries
 * NO attribute, so it stays responsive to the host's light/dark. Named themes write
 * the attribute, which re-skins this root and every descendant through inheritance.
 *
 * Base UI portals Menu/Popover/Select/Combobox/Tooltip/Dialog/HoverCard to
 * `document.body` by default — outside the token scope. `usePortalContainer()` hands
 * each popup the root element so `container={...}` keeps the theme + font (gate G5).
 *
 * The root element is published through a *callback ref + state*, not a plain ref.
 * A ref's `.current` is still null while descendants first render, and an uncontrolled
 * popup never re-reads it — so a ref would leave `container` null and Base UI would
 * render the popup nowhere. Storing the element in state re-renders consumers once it
 * is attached, so every popup that opens later receives the live root element.
 */
import { createContext, use, useState, type ComponentPropsWithoutRef } from "react";

import { cn } from "#shared/lib/cn";

export type ThemeName = "graphite" | "sapphire" | "sage" | "ocean";

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
