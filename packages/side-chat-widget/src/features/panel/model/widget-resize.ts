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

import type { SideChatWidgetPanelSize } from "#entities/panel";
import {
  calculateResizedPanel,
  clampPanelOffset,
  clampPanelSize,
  getInitialPanelSize,
  getResizeCursor,
  type PanelOffset,
  type PanelSize,
  type ResizeHandle,
} from "./widget-resize-calculation.js";

export { calculateResizedPanel };
export type { ResizeHandle };

type ResizeSession = {
  readonly handle: ResizeHandle;
  readonly pointerId: number;
  readonly startHeight: number;
  readonly startOffset: PanelOffset;
  readonly startWidth: number;
  readonly startX: number;
  readonly startY: number;
  readonly target: HTMLElement;
  hasDragged: boolean;
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

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      resizeRef.current = {
        handle,
        hasDragged: false,
        pointerId: event.pointerId,
        startHeight: panelSizeRef.current.height,
        startOffset: panelOffsetRef.current,
        startWidth: panelSizeRef.current.width,
        startX: event.clientX,
        startY: event.clientY,
        target: event.currentTarget,
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

      const next = calculateResizedPanel({
        currentX: event.clientX,
        currentY: event.clientY,
        handle: resize.handle,
        startHeight: resize.startHeight,
        startOffset: resize.startOffset,
        startWidth: resize.startWidth,
        startX: resize.startX,
        startY: resize.startY,
      });

      setPanelSize(next.panelSize);
      setPanelOffset(next.panelOffset);
    };
    const stopResize = () => releaseResizeSession(resizeRef);

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

const releaseResizeSession = (resizeRef: MutableRefObject<ResizeSession | null>): void => {
  const resize = resizeRef.current;
  try {
    resize?.target.releasePointerCapture(resize.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
  resizeRef.current = null;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
};
