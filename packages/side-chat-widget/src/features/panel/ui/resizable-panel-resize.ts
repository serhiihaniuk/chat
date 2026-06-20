import {
  useEffect,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";

import type { SideChatWidgetPanelSize } from "#entities/panel";

export type Anchor = "fixed" | "absolute";
export type ResizablePanelSize = SideChatWidgetPanelSize;
export type Offset = { readonly x: number; readonly y: number };
export type ResizablePanelBounds = { readonly width: number; readonly height: number };
export type ResizeHandle = "left" | "right" | "top" | "bottom" | "top-left" | "top-right";
export type ResizeStart = {
  readonly size: ResizablePanelSize;
  readonly offset: Offset;
  readonly x: number;
  readonly y: number;
};

export type ResizeSession = {
  handle: ResizeHandle;
  panel: HTMLElement;
  target: HTMLElement;
  pointerId: number;
  start: ResizeStart;
  bounds: ResizablePanelBounds;
  dragging: boolean;
  frame: number | undefined;
  pending: { x: number; y: number } | undefined;
  latest: { size: ResizablePanelSize; offset: Offset } | undefined;
};

export type SessionRef = MutableRefObject<ResizeSession | null>;
export type CommitPanelSize = (size: ResizablePanelSize) => void;

const MIN: ResizablePanelSize = { width: 360, height: 420 };
const GUTTER = 32;
const INSET = 16;
const FALLBACK: ResizablePanelBounds = { width: 1280, height: 880 };
const DRAG_THRESHOLD = 4;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const fromLeft = (handle: ResizeHandle): boolean => handle === "left" || handle === "top-left";
const fromRight = (handle: ResizeHandle): boolean => handle === "right" || handle === "top-right";
const fromTop = (handle: ResizeHandle): boolean =>
  handle === "top" || handle === "top-left" || handle === "top-right";
const fromBottom = (handle: ResizeHandle): boolean => handle === "bottom";

const cursorFor = (handle: ResizeHandle): string => {
  if (handle === "top-left") return "nwse-resize";
  if (handle === "top-right") return "nesw-resize";
  if (handle === "top" || handle === "bottom") return "ns-resize";
  return "ew-resize";
};

const clampSize = (size: ResizablePanelSize, bounds: ResizablePanelBounds): ResizablePanelSize => ({
  width: clamp(size.width, MIN.width, Math.max(MIN.width, bounds.width - GUTTER)),
  height: clamp(size.height, MIN.height, Math.max(MIN.height, bounds.height - GUTTER)),
});

const clampOffset = (
  offset: Offset,
  size: ResizablePanelSize,
  bounds: ResizablePanelBounds,
): Offset => ({
  x: clamp(offset.x, -Math.max(0, bounds.width - size.width - INSET), INSET),
  y: clamp(offset.y, -Math.max(0, bounds.height - size.height - INSET), INSET),
});

const getNextWidth = (
  handle: ResizeHandle,
  start: ResizeStart,
  point: { readonly x: number; readonly y: number },
): number => {
  if (fromLeft(handle)) return start.size.width + start.x - point.x;
  if (fromRight(handle)) return start.size.width + point.x - start.x;
  return start.size.width;
};

const getNextHeight = (
  handle: ResizeHandle,
  start: ResizeStart,
  point: { readonly x: number; readonly y: number },
): number => {
  if (fromTop(handle)) return start.size.height + start.y - point.y;
  if (fromBottom(handle)) return start.size.height + point.y - start.y;
  return start.size.height;
};

export const calculateResizedPanel = (
  handle: ResizeHandle,
  start: ResizeStart,
  point: { readonly x: number; readonly y: number },
  bounds: ResizablePanelBounds,
): { readonly size: ResizablePanelSize; readonly offset: Offset } => {
  const size = clampSize(
    {
      width: getNextWidth(handle, start, point),
      height: getNextHeight(handle, start, point),
    },
    bounds,
  );
  const offset = clampOffset(
    {
      x: fromRight(handle) ? start.offset.x + size.width - start.size.width : start.offset.x,
      y: fromBottom(handle) ? start.offset.y + size.height - start.size.height : start.offset.y,
    },
    size,
    bounds,
  );
  return { size, offset };
};

const boundsFor = (panel: HTMLElement, anchor: Anchor): ResizablePanelBounds => {
  if (typeof window === "undefined") return FALLBACK;
  if (anchor === "fixed") return { width: window.innerWidth, height: window.innerHeight };
  const parent = panel.offsetParent;
  return parent instanceof HTMLElement
    ? { width: parent.clientWidth, height: parent.clientHeight }
    : { width: window.innerWidth, height: window.innerHeight };
};

export const sizeStyle = (
  size: ResizablePanelSize,
  offset: Offset,
  anchor: Anchor,
): CSSProperties => ({
  width: size.width,
  height: size.height,
  transform: `translate(${offset.x}px, ${offset.y}px)`,
  maxWidth: anchor === "fixed" ? "calc(100vw - 2rem)" : "calc(100% - 2rem)",
  maxHeight: anchor === "fixed" ? "calc(100vh - 2rem)" : "calc(100% - 2rem)",
  willChange: "transform",
});

export const createResizeSession = ({
  anchor,
  event,
  handle,
  offset,
  panel,
  size,
}: {
  readonly anchor: Anchor;
  readonly event: ReactPointerEvent<HTMLButtonElement>;
  readonly handle: ResizeHandle;
  readonly offset: Offset;
  readonly panel: HTMLElement;
  readonly size: ResizablePanelSize;
}): ResizeSession => ({
  handle,
  panel,
  target: event.currentTarget,
  pointerId: event.pointerId,
  start: { size, offset, x: event.clientX, y: event.clientY },
  bounds: boundsFor(panel, anchor),
  dragging: false,
  frame: undefined,
  pending: undefined,
  latest: undefined,
});

const applyResizeFrame = (session: SessionRef): void => {
  const active = session.current;
  if (active) active.frame = undefined;
  if (!active?.pending) return;
  const next = calculateResizedPanel(active.handle, active.start, active.pending, active.bounds);
  active.pending = undefined;
  active.latest = next;
  active.panel.style.width = `${next.size.width}px`;
  active.panel.style.height = `${next.size.height}px`;
  active.panel.style.transform = `translate(${next.offset.x}px, ${next.offset.y}px)`;
};

const activateDragSession = (active: ResizeSession, event: PointerEvent): boolean => {
  if (active.dragging) return true;
  const distance = Math.hypot(event.clientX - active.start.x, event.clientY - active.start.y);
  if (distance < DRAG_THRESHOLD) return false;
  active.dragging = true;
  document.body.style.cursor = cursorFor(active.handle);
  document.body.style.userSelect = "none";
  return true;
};

const releaseResizeSession = (
  session: SessionRef,
  commitSize: CommitPanelSize,
  setOffset: Dispatch<SetStateAction<Offset>>,
): void => {
  const active = session.current;
  if (!active) return;
  if (active.frame !== undefined) window.cancelAnimationFrame(active.frame);
  applyResizeFrame(session);
  try {
    active.target.releasePointerCapture(active.pointerId);
  } catch {
    /* Pointer capture may already be released by the browser. */
  }
  if (active.latest) {
    commitSize(active.latest.size);
    setOffset(active.latest.offset);
  }
  session.current = null;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
};

export const usePanelResizeEvents = (
  session: SessionRef,
  commitSize: CommitPanelSize,
  setOffset: Dispatch<SetStateAction<Offset>>,
): void => {
  useEffect(() => {
    const apply = (): void => applyResizeFrame(session);
    const move = (event: PointerEvent): void => {
      const active = session.current;
      if (!active || !activateDragSession(active, event)) return;
      active.pending = { x: event.clientX, y: event.clientY };
      if (active.frame === undefined) active.frame = window.requestAnimationFrame(apply);
    };
    const stop = (): void => releaseResizeSession(session, commitSize, setOffset);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      stop();
    };
  }, [session, commitSize, setOffset]);
};
