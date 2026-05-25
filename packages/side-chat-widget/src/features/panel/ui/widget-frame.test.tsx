import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResizeHandles, toPanelStyle, WidgetHeader } from "./widget-frame.js";

describe("widget-frame", () => {
  it("creates stable inline panel dimensions and transform", () => {
    expect(toPanelStyle({ width: 640, height: 760 }, { x: -12, y: 16 })).toEqual({
      height: 760,
      transform: "translate(-12px, 16px)",
      width: 640,
      willChange: "transform",
    });
  });

  it("renders all resize handles with accessible labels", () => {
    const html = renderToStaticMarkup(<ResizeHandles onResizeStart={() => undefined} />);

    expect(html).toContain("Resize assistant panel from top left");
    expect(html).toContain("Resize assistant panel from top right");
    expect(html).toContain("Resize assistant panel from left edge");
    expect(html).toContain("Resize assistant panel from right edge");
    expect(html).toContain("Resize assistant panel height");
    expect(html).toContain("Resize assistant panel from bottom edge");
  });

  it("renders an accessible close control in the header", () => {
    const html = renderToStaticMarkup(
      <WidgetHeader onClose={() => undefined} title="Workspace Assistant" />,
    );

    expect(html).toContain("Workspace Assistant");
    expect(html).toContain('aria-label="Close"');
  });
});
