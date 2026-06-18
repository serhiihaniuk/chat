import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { omitUndefinedProperties } from "@side-chat/shared";

import type { SideChatWidgetPanelSize } from "#entities/panel";
import {
  calculateResizedPanel,
  clampPanelOffset,
  clampPanelSize,
  getInitialPanelSize,
  getResizeCursor,
  type PanelOffset,
  type PanelSize,
  type ResizeCalculationInput,
  type ResizeHandle,
  type ViewportSize,
} from "./widget-resize-calculation.js";
import {
  applyPanelStyle,
  cancelResizeFrameId,
  readOptionalResizePoint,
  readResizePoint,
  readViewportSize,
  requestResizeFrame,
  type ResizedPanel,
  type ResizePoint,
} from "./widget-resize-dom.js";

export { calculateResizedPanel };
export type { ResizeHandle };

type ResizeSession = {
  animationFrame: number | undefined;
  readonly handle: ResizeHandle;
  readonly panelElement: HTMLElement;
  pendingPoint: ResizePoint | undefined;
  readonly pointerId: number;
  readonly startHeight: number;
  readonly startOffset: PanelOffset;
  readonly startWidth: number;
  readonly startX: number;
  readonly startY: number;
  readonly target: HTMLElement;
  readonly viewport: ViewportSize | undefined;
  hasDragged: boolean;
  latestPanel: ResizedPanel | undefined;
};

export const useResizableWidgetPanel = (defaultPanelSize: SideChatWidgetPanelSize | undefined) => {
  const [panelSize, setPanelSize] = useState(() => getInitialPanelSize(defaultPanelSize));
  const [panelOffset, setPanelOffset] = useState<PanelOffset>({ x: 0, y: 0 });
  const panelSizeRef = useLatestValue(panelSize);
  const panelOffsetRef = useLatestValue(panelOffset);
  const resizeRef = useRef<ResizeSession | null>(null);

  useResizeDragEvents(resizeRef, setPanelSize, setPanelOffset);
  useViewportClamp(setPanelSize, setPanelOffset);

  const startResize = useCallback(
    (handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const panelElement = event.currentTarget.closest(".side-chat-widget-root");
      if (!(panelElement instanceof HTMLElement)) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      resizeRef.current = {
        animationFrame: undefined,
        handle,
        hasDragged: false,
        latestPanel: undefined,
        panelElement,
        pendingPoint: undefined,
        pointerId: event.pointerId,
        startHeight: panelSizeRef.current.height,
        startOffset: panelOffsetRef.current,
        startWidth: panelSizeRef.current.width,
        startX: event.clientX,
        startY: event.clientY,
        target: event.currentTarget,
        viewport: readViewportSize(),
      };
    },
    [panelOffsetRef, panelSizeRef],
  );

  return {
    panelOffset,
    panelSize,
    startResize,
  };
};

const useLatestValue = <Value>(value: Value): MutableRefObject<Value> => {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
};

const useResizeDragEvents = (
  resizeRef: MutableRefObject<ResizeSession | null>,
  setPanelSize: Dispatch<SetStateAction<PanelSize>>,
  setPanelOffset: Dispatch<SetStateAction<PanelOffset>>,
): void => {
  useEffect(() => {
    const resizePanel = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      if (!activateResizeAfterDragThreshold(resize, event)) return;

      resize.pendingPoint = readResizePoint(event);
      scheduleResizeFrame(resize);
    };
    const stopResize = (event?: Event) =>
      releaseResizeSession(resizeRef, setPanelSize, setPanelOffset, readOptionalResizePoint(event));

    window.addEventListener("pointermove", resizePanel);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    window.addEventListener("blur", stopResize);

    return () => {
      window.removeEventListener("pointermove", resizePanel);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      window.removeEventListener("blur", stopResize);
      stopResize();
    };
  }, [resizeRef, setPanelOffset, setPanelSize]);
};

const useViewportClamp = (
  setPanelSize: Dispatch<SetStateAction<PanelSize>>,
  setPanelOffset: Dispatch<SetStateAction<PanelOffset>>,
): void => {
  useEffect(() => {
    const handleViewportResize = () => {
      setPanelSize((current) => {
        const nextSize = clampPanelSize(current);
        setPanelOffset((currentOffset) => clampPanelOffset(currentOffset, nextSize));
        return nextSize;
      });
    };

    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, [setPanelOffset, setPanelSize]);
};

const activateResizeAfterDragThreshold = (resize: ResizeSession, event: PointerEvent): boolean => {
  if (resize.hasDragged) return true;

  const distance = Math.hypot(event.clientX - resize.startX, event.clientY - resize.startY);
  if (distance < 4) return false;

  resize.hasDragged = true;
  document.body.style.cursor = getResizeCursor(resize.handle);
  document.body.style.userSelect = "none";
  return true;
};

const releaseResizeSession = (
  resizeRef: MutableRefObject<ResizeSession | null>,
  setPanelSize: Dispatch<SetStateAction<PanelSize>>,
  setPanelOffset: Dispatch<SetStateAction<PanelOffset>>,
  releasePoint?: ResizePoint,
): void => {
  const resize = resizeRef.current;
  if (resize) {
    applyPendingResize(resize, releasePoint);
    cancelResizeFrame(resize);
  }
  try {
    resize?.target.releasePointerCapture(resize.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
  if (resize?.latestPanel) {
    setPanelSize(resize.latestPanel.panelSize);
    setPanelOffset(resize.latestPanel.panelOffset);
  }
  resizeRef.current = null;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
};

const createResizeCalculationInput = (
  resize: ResizeSession,
  point: ResizePoint,
): ResizeCalculationInput =>
  omitUndefinedProperties({
    currentX: point.currentX,
    currentY: point.currentY,
    handle: resize.handle,
    startHeight: resize.startHeight,
    startOffset: resize.startOffset,
    startWidth: resize.startWidth,
    startX: resize.startX,
    startY: resize.startY,
    viewport: resize.viewport,
  });

// Dragging can fire more often than React can cheaply re-render the full widget
// tree. During the drag, update only the panel element's geometry; React state is
// synchronized once on release so other UI decisions see the final size.
const scheduleResizeFrame = (resize: ResizeSession): void => {
  if (resize.animationFrame !== undefined) return;
  resize.animationFrame = requestResizeFrame(() => {
    resize.animationFrame = undefined;
    applyPendingResize(resize);
  });
};

const applyPendingResize = (resize: ResizeSession, releasePoint?: ResizePoint): void => {
  const point = releasePoint ?? resize.pendingPoint;
  resize.pendingPoint = undefined;
  if (!point) return;

  const next = calculateResizedPanel(createResizeCalculationInput(resize, point));
  resize.latestPanel = next;
  applyPanelStyle(resize.panelElement, next);
};

const cancelResizeFrame = (resize: ResizeSession): void => {
  if (resize.animationFrame === undefined) return;
  cancelResizeFrameId(resize.animationFrame);
  resize.animationFrame = undefined;
};
