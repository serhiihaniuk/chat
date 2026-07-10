/**
 * <Preview> — renders REAL widget components in an isolated Shadow DOM.
 *
 * Why a shadow root: the widget's styles.css is its own complete Tailwind v4 build
 * (its own preflight + `@theme` overrides of --text-*, --radius, spacing, shadows).
 * Loaded into the page globally it would clobber Fumadocs' identically-named utility
 * classes (.text-base, .rounded-md, .p-4, …). A shadow root gives each demo the
 * widget's full stylesheet with zero leakage either way. The widget's
 * `usePortalContainer()` already mounts every Base UI popup into the widget root, so
 * menus/selects/tooltips stay inside this scope.
 *
 * Two adjustments make the widget CSS work inside a shadow root:
 *  - The widget's tier-1 tokens are declared on `:root`, which matches nothing in a
 *    shadow tree, so we rewrite `:root` -> `:host` (tokens then sit on the shadow host
 *    and inherit down; the .dark / data-sidechat-theme overrides on the widget root,
 *    a host descendant, still win because a directly-set value beats an inherited one).
 *  - `@font-face` declared only inside a shadow root is unreliable across browsers, so
 *    we also register the font faces once in the document head.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SideChatWidgetRoot } from "@side-chat/side-chat-widget/ui/widget-root";

import { useDesignControls } from "./design-controls";
import { ensureWidgetFontsInDocument, WIDGET_SHADOW_CSS } from "./widget-preview-css";

// Base UI popovers render in a `position:absolute; z-index:auto` positioner. In the
// real widget they portal into the high-z floating panel, so they're elevated for free;
// here the demo card provides no such elevation, so a later static code block can paint
// over an open popup. Lift the positioners above sibling docs content (docs-only — the
// widget itself is untouched).
export interface PreviewProps {
  children: ReactNode;
  /** Extra classes for the inner canvas (e.g. layout/centering). */
  className?: string;
  /** Disable the default canvas padding when the demo manages its own. */
  padded?: boolean;
}

export function Preview({ children, className, padded = true }: PreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const { theme, dark, cssVars } = useDesignControls();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    ensureWidgetFontsInDocument();

    let root = host.shadowRoot;
    if (!root) {
      root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = WIDGET_SHADOW_CSS;
      root.appendChild(style);
      const target = document.createElement("div");
      target.dataset["previewMount"] = "";
      root.appendChild(target);
    }
    setMount(root.querySelector<HTMLElement>("[data-preview-mount]"));
  }, []);

  return (
    <div className="not-prose my-4 overflow-hidden rounded-xl border border-fd-border bg-fd-card">
      <div ref={hostRef} />
      {mount
        ? createPortal(
            <SideChatWidgetRoot
              theme={theme}
              className={dark ? "dark" : undefined}
              style={cssVars}
            >
              <div
                className={className}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "1.25rem",
                  background: "var(--sc-canvas)",
                  color: "var(--foreground)",
                  padding: padded ? "1.75rem" : undefined,
                  minHeight: "3rem",
                }}
              >
                {children}
              </div>
            </SideChatWidgetRoot>,
            mount,
          )
        : null}
    </div>
  );
}
