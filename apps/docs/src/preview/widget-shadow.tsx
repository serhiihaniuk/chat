import widgetStyles from "@side-chat/side-chat-widget/styles.css?inline";
import { useCallback, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

import previewStyles from "./preview.css?inline";

// The distributable stylesheet targets document :root. Inside the isolated docs
// preview, :host is the equivalent owner of inherited widget tokens.
const SHADOW_STYLES = `${widgetStyles.replaceAll(":root", ":host")}\n${previewStyles}`;

export function WidgetShadow({ children }: { readonly children: ReactNode }): ReactElement {
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);
  const mountShadow = useCallback((host: HTMLDivElement | null): void => {
    if (!host) return;
    setShadowRoot(host.shadowRoot ?? host.attachShadow({ mode: "open" }));
  }, []);

  return (
    <div className="docs-shadow-host" ref={mountShadow}>
      {shadowRoot
        ? createPortal(
            <>
              <style>{SHADOW_STYLES}</style>
              {children}
            </>,
            shadowRoot,
          )
        : null}
    </div>
  );
}
