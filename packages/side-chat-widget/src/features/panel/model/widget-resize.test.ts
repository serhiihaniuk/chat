import { describe, expect, it } from "vitest";

import { calculateResizedPanel } from "./widget-resize.js";

describe("calculateResizedPanel", () => {
  it("grows from the right edge and moves the anchored panel offset", () => {
    expect(
      calculateResizedPanel({
        currentX: 760,
        currentY: 500,
        handle: "right",
        startHeight: 600,
        startOffset: { x: 0, y: 0 },
        startWidth: 640,
        startX: 700,
        startY: 500,
        viewport: { width: 1200, height: 900 },
      }),
    ).toEqual({
      panelSize: { width: 700, height: 600 },
      panelOffset: { x: 16, y: 0 },
    });
  });

  it("grows from the left edge without shifting the bottom-right anchor", () => {
    expect(
      calculateResizedPanel({
        currentX: 620,
        currentY: 500,
        handle: "left",
        startHeight: 600,
        startOffset: { x: 0, y: 0 },
        startWidth: 640,
        startX: 700,
        startY: 500,
        viewport: { width: 1200, height: 900 },
      }),
    ).toEqual({
      panelSize: { width: 720, height: 600 },
      panelOffset: { x: 0, y: 0 },
    });
  });

  it("clamps to the minimum panel size", () => {
    expect(
      calculateResizedPanel({
        currentX: 900,
        currentY: 900,
        handle: "top-left",
        startHeight: 600,
        startOffset: { x: 0, y: 0 },
        startWidth: 640,
        startX: 700,
        startY: 700,
        viewport: { width: 1200, height: 900 },
      }).panelSize,
    ).toEqual({ width: 440, height: 420 });
  });

  it("clamps to the viewport gutter", () => {
    expect(
      calculateResizedPanel({
        currentX: 1400,
        currentY: 1200,
        handle: "bottom",
        startHeight: 600,
        startOffset: { x: 0, y: 0 },
        startWidth: 640,
        startX: 700,
        startY: 700,
        viewport: { width: 1000, height: 800 },
      }),
    ).toEqual({
      panelSize: { width: 640, height: 768 },
      panelOffset: { x: 0, y: 16 },
    });
  });
});
