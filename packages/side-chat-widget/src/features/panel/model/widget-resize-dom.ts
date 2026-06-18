import type { PanelOffset, PanelSize, ViewportSize } from "./widget-resize-calculation.js";

export type ResizedPanel = {
  readonly panelOffset: PanelOffset;
  readonly panelSize: PanelSize;
};

export type ResizePoint = {
  readonly currentX: number;
  readonly currentY: number;
};

export const applyPanelStyle = (
  panelElement: HTMLElement,
  { panelOffset, panelSize }: ResizedPanel,
): void => {
  panelElement.style.width = `${panelSize.width}px`;
  panelElement.style.height = `${panelSize.height}px`;
  panelElement.style.transform = `translate(${panelOffset.x}px, ${panelOffset.y}px)`;
};

export const readViewportSize = (): ViewportSize | undefined =>
  typeof window === "undefined"
    ? undefined
    : { height: window.innerHeight, width: window.innerWidth };

export const readResizePoint = (event: PointerEvent): ResizePoint => ({
  currentX: event.clientX,
  currentY: event.clientY,
});

export const readOptionalResizePoint = (event: Event | undefined): ResizePoint | undefined =>
  typeof PointerEvent !== "undefined" && event instanceof PointerEvent
    ? readResizePoint(event)
    : undefined;

export const requestResizeFrame = (callback: FrameRequestCallback): number =>
  typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => callback(window.performance.now()), 16);

export const cancelResizeFrameId = (frameId: number): void => {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(frameId);
    return;
  }
  window.clearTimeout(frameId);
};
