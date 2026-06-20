import widgetCss from "@side-chat/side-chat-widget/styles.css?inline";

// Demos and the configurator probe share the same shadow-scoped widget stylesheet.
// The extra positioner rule is docs-only: it keeps Base UI popups above neighboring
// code blocks inside preview cards without changing the real widget package.
export const WIDGET_SHADOW_CSS =
  widgetCss.replace(/:root\b/g, ":host") + '\n[role="presentation"][data-side]{z-index:50;}\n';

const FONT_STYLE_ID = "side-chat-widget-fonts";

export function ensureWidgetFontsInDocument(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(FONT_STYLE_ID)) return;
  const faces = WIDGET_SHADOW_CSS.match(/@font-face\s*\{[^}]*\}/g);
  if (!faces || faces.length === 0) return;
  const style = document.createElement("style");
  style.id = FONT_STYLE_ID;
  style.textContent = faces.join("\n");
  document.head.appendChild(style);
}
