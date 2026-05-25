import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { SideChatWidgetPanelSize } from "./widget.types.js";

export type ResizeHandle = "left" | "right" | "top" | "bottom" | "top-left" | "top-right";

type PanelOffset = { readonly x: number; readonly y: number };
type PanelSize = SideChatWidgetPanelSize;

const panelInset = 16;
const viewportGutter = 32;
const minPanelSize: PanelSize = { width: 360, height: 420 };
const fallbackPanelSize: PanelSize = { width: 640, height: 760 };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const clampPanelSize = (size: PanelSize): PanelSize => {
  const maxWidth =
    typeof window === "undefined" ? fallbackPanelSize.width : window.innerWidth - viewportGutter;
  const maxHeight =
    typeof window === "undefined" ? fallbackPanelSize.height : window.innerHeight - viewportGutter;

  return {
    width: clamp(size.width, minPanelSize.width, maxWidth),
    height: clamp(size.height, minPanelSize.height, maxHeight),
  };
};

const clampPanelOffset = (offset: PanelOffset, size: PanelSize): PanelOffset => {
  if (typeof window === "undefined") return offset;

  const maxOffsetX = Math.max(0, window.innerWidth - size.width - panelInset);
  const maxOffsetY = Math.max(0, window.innerHeight - size.height - panelInset);
  return {
    x: clamp(offset.x, -maxOffsetX, panelInset),
    y: clamp(offset.y, -maxOffsetY, panelInset),
  };
};

const handleResizesFromLeft = (handle: ResizeHandle): boolean =>
  handle === "left" || handle === "top-left";

const handleResizesFromRight = (handle: ResizeHandle): boolean =>
  handle === "right" || handle === "top-right";

const handleResizesFromTop = (handle: ResizeHandle): boolean =>
  handle === "top" || handle === "top-left" || handle === "top-right";

const handleResizesFromBottom = (handle: ResizeHandle): boolean => handle === "bottom";

const getResizeCursor = (handle: ResizeHandle): string => {
  if (handle === "top-left") return "nwse-resize";
  if (handle === "top-right") return "nesw-resize";
  if (handle === "top" || handle === "bottom") return "ns-resize";
  return "ew-resize";
};

const getNextWidth = (
  handle: ResizeHandle,
  startWidth: number,
  startX: number,
  currentX: number,
): number => {
  if (handleResizesFromLeft(handle)) return startWidth + startX - currentX;
  if (handleResizesFromRight(handle)) return startWidth + currentX - startX;
  return startWidth;
};

const getNextHeight = (
  handle: ResizeHandle,
  startHeight: number,
  startY: number,
  currentY: number,
): number => {
  if (handleResizesFromTop(handle)) return startHeight + startY - currentY;
  if (handleResizesFromBottom(handle)) return startHeight + currentY - startY;
  return startHeight;
};

const getInitialPanelSize = (defaultPanelSize: SideChatWidgetPanelSize | undefined): PanelSize =>
  clampPanelSize(defaultPanelSize ?? fallbackPanelSize);

export const useResizableWidgetPanel = (defaultPanelSize: SideChatWidgetPanelSize | undefined) => {
  const [panelSize, setPanelSize] = useState(() => getInitialPanelSize(defaultPanelSize));
  const [panelOffset, setPanelOffset] = useState<PanelOffset>({ x: 0, y: 0 });
  const panelSizeRef = useRef(panelSize);
  const panelOffsetRef = useRef(panelOffset);
  const resizeRef = useRef<{
    readonly handle: ResizeHandle;
    readonly pointerId: number;
    readonly startHeight: number;
    readonly startOffset: PanelOffset;
    readonly startWidth: number;
    readonly startX: number;
    readonly startY: number;
    readonly target: HTMLElement;
    hasDragged: boolean;
  } | null>(null);

  useEffect(() => {
    panelSizeRef.current = panelSize;
  }, [panelSize]);

  useEffect(() => {
    panelOffsetRef.current = panelOffset;
  }, [panelOffset]);

  useEffect(() => {
    const resizePanel = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;

      const distance = Math.hypot(event.clientX - resize.startX, event.clientY - resize.startY);
      if (!resize.hasDragged) {
        if (distance < 4) return;
        resize.hasDragged = true;
        document.body.style.cursor = getResizeCursor(resize.handle);
        document.body.style.userSelect = "none";
      }

      const nextWidth = getNextWidth(
        resize.handle,
        resize.startWidth,
        resize.startX,
        event.clientX,
      );
      const nextHeight = getNextHeight(
        resize.handle,
        resize.startHeight,
        resize.startY,
        event.clientY,
      );
      const nextSize = clampPanelSize({
        height: nextHeight,
        width: nextWidth,
      });
      const nextOffset = {
        x: handleResizesFromRight(resize.handle)
          ? resize.startOffset.x + nextSize.width - resize.startWidth
          : resize.startOffset.x,
        y: handleResizesFromBottom(resize.handle)
          ? resize.startOffset.y + nextSize.height - resize.startHeight
          : resize.startOffset.y,
      };

      setPanelSize(nextSize);
      setPanelOffset(clampPanelOffset(nextOffset, nextSize));
    };

    const stopResize = () => {
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
  }, []);

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
  }, []);

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
    [],
  );

  return {
    panelOffset,
    panelSize,
    startResize,
  };
};
