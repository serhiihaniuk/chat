import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { calculateResizedPanel, ResizablePanel } from "./resizable-panel.js";

const START = {
  size: { width: 640, height: 600 },
  offset: { x: 0, y: 0 },
  x: 700,
  y: 500,
};

describe("ResizablePanel", () => {
  it("renders resize handles with accessible labels", () => {
    const html = renderToStaticMarkup(
      <ResizablePanel defaultSize={{ width: 640, height: 760 }}>
        <div>Panel body</div>
      </ResizablePanel>,
    );

    expect(html).toContain("Resize panel from top left");
    expect(html).toContain("Resize panel from top right");
    expect(html).toContain("Resize panel from left edge");
    expect(html).toContain("Resize panel from right edge");
    expect(html).toContain("Resize panel from top edge");
    expect(html).toContain("Resize panel from bottom edge");
    expect(html).toContain("Panel body");
  });

  it("keeps resize handles above full-panel overlays", () => {
    const html = renderToStaticMarkup(
      <ResizablePanel defaultSize={{ width: 640, height: 760 }}>
        <div>Panel body</div>
      </ResizablePanel>,
    );

    expect(html.match(/z-\[80\]/g)).toHaveLength(6);
  });

  it("grows from the right edge and clamps the anchored panel offset", () => {
    expect(
      calculateResizedPanel("right", START, { x: 760, y: 500 }, { width: 1200, height: 900 }),
    ).toEqual({
      size: { width: 700, height: 600 },
      offset: { x: 16, y: 0 },
    });
  });

  it("grows from the left edge without shifting the bottom-right anchor", () => {
    expect(
      calculateResizedPanel("left", START, { x: 620, y: 500 }, { width: 1200, height: 900 }),
    ).toEqual({
      size: { width: 720, height: 600 },
      offset: { x: 0, y: 0 },
    });
  });

  it("clamps to the minimum panel size", () => {
    expect(
      calculateResizedPanel(
        "top-left",
        { ...START, y: 700 },
        { x: 900, y: 900 },
        { width: 1200, height: 900 },
      ).size,
    ).toEqual({ width: 440, height: 420 });
  });

  it("clamps to the viewport gutter", () => {
    expect(
      calculateResizedPanel(
        "bottom",
        { ...START, y: 700 },
        { x: 1400, y: 1200 },
        { width: 1000, height: 800 },
      ),
    ).toEqual({
      size: { width: 640, height: 768 },
      offset: { x: 0, y: 16 },
    });
  });
});
