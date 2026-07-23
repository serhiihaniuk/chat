import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { calculateResizedPanel, ResizablePanel } from "./resizable-panel.js";

const styles = readFileSync(new URL("../../../../styles.css", import.meta.url), "utf8");

const START = {
  size: { width: 640, height: 600 },
  offset: { x: 0, y: 0 },
  x: 700,
  y: 500,
};

// Render with a stubbed `window.matchMedia` reporting a mobile viewport, so the
// panel's `useIsMobile` lazy initializer resolves true during SSR. Scoped + restored
// so it never leaks the desktop default the other cases rely on.
const renderWithMobileViewport = (element: React.ReactElement): string => {
  const original = Reflect.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { matchMedia: () => ({ matches: true }) },
  });
  try {
    return renderToStaticMarkup(element);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
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

    expect(html.match(/z-\(--layer-panel-resize-handle\)/g)).toHaveLength(6);
    expect(html).toContain("z-(--layer-panel)");
  });

  it("declares named layer tokens for panel handles and dialogs", () => {
    expect(styles).toContain("--layer-panel: 50;");
    expect(styles).toContain("--layer-panel-resize-handle: 80;");
    expect(styles).toContain("--layer-dialog-backdrop: 90;");
    expect(styles).toContain("--layer-dialog-content: 91;");
    expect(styles).toContain("z-index: var(--layer-dialog-backdrop);");
    expect(styles).toContain("z-index: var(--layer-dialog-content);");
    expect(styles).toContain("background: var(--dialog-backdrop-bg);");
  });

  it("becomes a full-width bottom sheet with no resize handles below the mobile breakpoint", () => {
    const html = renderWithMobileViewport(
      <ResizablePanel defaultSize={{ width: 640, height: 760 }}>
        <div>Panel body</div>
      </ResizablePanel>,
    );

    expect(html).toContain("sc-widget-sheet");
    expect(html).toContain("inset-x-0");
    expect(html).not.toContain("Resize panel from");
    expect(html).toContain("Panel body");
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
