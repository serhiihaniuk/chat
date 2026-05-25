import {
  clamp,
  getPanelAnchorPosition,
  handleResizesFromBottom,
  handleResizesFromLeft,
  handleResizesFromRight,
  handleResizesFromTop,
  panelDragGutter,
  type PanelOffset,
  type PanelSize,
  type ResizeHandle,
} from "./panel-geometry.js";
import type { PanelState } from "./panel-state.js";

export type ResizeSession = {
  hasDragged: boolean;
  handle: ResizeHandle;
  pointerId: number;
  startHeight: number;
  startOffset: PanelOffset;
  startWidth: number;
  startX: number;
  startY: number;
  target: HTMLElement;
};

export type DragSession = {
  anchorLeft: number;
  anchorTop: number;
  height: number;
  startLeft: number;
  startTop: number;
  startX: number;
  startY: number;
  width: number;
};

export const nextResizeWidth = (
  resize: ResizeSession,
  event: PointerEvent,
): number => {
  if (handleResizesFromLeft(resize.handle)) {
    return resize.startWidth + resize.startX - event.clientX;
  }
  if (handleResizesFromRight(resize.handle)) {
    return resize.startWidth + event.clientX - resize.startX;
  }
  return resize.startWidth;
};

export const nextResizeHeight = (
  resize: ResizeSession,
  event: PointerEvent,
): number => {
  if (handleResizesFromTop(resize.handle)) {
    return resize.startHeight + resize.startY - event.clientY;
  }
  if (handleResizesFromBottom(resize.handle)) {
    return resize.startHeight + event.clientY - resize.startY;
  }
  return resize.startHeight;
};

export const nextResizeOffset = (
  resize: ResizeSession,
  size: PanelSize,
): PanelOffset => ({
  x: handleResizesFromRight(resize.handle)
    ? resize.startOffset.x + size.width - resize.startWidth
    : resize.startOffset.x,
  y: handleResizesFromBottom(resize.handle)
    ? resize.startOffset.y + size.height - resize.startHeight
    : resize.startOffset.y,
});

export const releasePointer = (resize: ResizeSession | null): void => {
  try {
    resize?.target.releasePointerCapture(resize.pointerId);
  } catch {
    // Pointer capture is best-effort; the browser may already have released it.
  }
};

export const createResizeSession = (
  handle: ResizeHandle,
  event: Pick<
    ReactPointerEvent<HTMLButtonElement>,
    "clientX" | "clientY" | "currentTarget" | "pointerId"
  >,
  state: PanelState,
): ResizeSession => ({
  handle,
  hasDragged: false,
  pointerId: event.pointerId,
  startHeight: state.size.height,
  startOffset: state.offset,
  startWidth: state.size.width,
  startX: event.clientX,
  startY: event.clientY,
  target: event.currentTarget,
});

export const createDragSession = (
  panel: HTMLElement,
  event: Pick<ReactPointerEvent<HTMLElement>, "clientX" | "clientY">,
  offset: PanelOffset,
): DragSession => {
  const rect = panel.getBoundingClientRect();
  const anchor = getPanelAnchorPosition(panel);
  return {
    anchorLeft: anchor.left - offset.x,
    anchorTop: anchor.top - offset.y,
    height: rect.height,
    startLeft: rect.left,
    startTop: rect.top,
    startX: event.clientX,
    startY: event.clientY,
    width: rect.width,
  };
};

export const nextDragOffset = (
  drag: DragSession,
  event: PointerEvent,
): PanelOffset => {
  const maxLeft = Math.max(
    panelDragGutter,
    window.innerWidth - drag.width - panelDragGutter,
  );
  const maxTop = Math.max(
    panelDragGutter,
    window.innerHeight - drag.height - panelDragGutter,
  );
  const left = clamp(
    drag.startLeft + event.clientX - drag.startX,
    panelDragGutter,
    maxLeft,
  );
  const top = clamp(
    drag.startTop + event.clientY - drag.startY,
    panelDragGutter,
    maxTop,
  );
  return { x: left - drag.anchorLeft, y: top - drag.anchorTop };
};
import type { PointerEvent as ReactPointerEvent } from "react";
