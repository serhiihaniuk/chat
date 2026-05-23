import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  clamp,
  clampPanelOffset,
  clampPanelSize,
  getDefaultPanelSize,
  getPanelAnchorPosition,
  getResizeCursor,
  handleResizesFromBottom,
  handleResizesFromLeft,
  handleResizesFromRight,
  handleResizesFromTop,
  panelDragGutter,
  type PanelOffset,
  type ResizeHandle,
} from "../../domain/panel/panel-geometry.js";

/**
 * Presentation hook for the panel shell only. Dragging, resizing, fullscreen,
 * and focus restoration are UI lifecycle concerns, so they live beside the
 * shell instead of in a global hooks bucket.
 */
type UsePanelShellOptions = {
  onOpen?: () => void;
  onClose?: () => void;
};

export const usePanelShell = ({
  onOpen,
  onClose,
}: UsePanelShellOptions) => {
  const [open, setOpen] = useState(false);
  const [panelSize, setPanelSize] = useState(getDefaultPanelSize);
  const [panelOffset, setPanelOffset] = useState<PanelOffset>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const restoreLauncherFocus = useRef(false);
  const panelOffsetRef = useRef(panelOffset);
  const resizeRef = useRef<{
    hasDragged: boolean;
    handle: ResizeHandle;
    pointerId: number;
    startOffset: PanelOffset;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    target: HTMLElement;
  } | null>(null);
  const dragRef = useRef<{
    anchorLeft: number;
    anchorTop: number;
    height: number;
    startLeft: number;
    startTop: number;
    startX: number;
    startY: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    panelOffsetRef.current = panelOffset;
  }, [panelOffset]);

  useEffect(() => {
    if (!open) {
      if (restoreLauncherFocus.current) {
        launcherButtonRef.current?.focus({ preventScroll: true });
        restoreLauncherFocus.current = false;
      }
      return;
    }

    setPanelSize((current) => clampPanelSize(current));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setPanelOffset((current) => clampPanelOffset(current, panelSize));
  }, [open, panelSize]);

  useEffect(() => {
    const resizePanel = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const distance = Math.hypot(
        event.clientX - resize.startX,
        event.clientY - resize.startY,
      );
      if (!resize.hasDragged) {
        if (distance < 4) return;
        resize.hasDragged = true;
        document.body.style.cursor = getResizeCursor(resize.handle);
        document.body.style.userSelect = "none";
      }

      const nextWidth = handleResizesFromLeft(resize.handle)
        ? resize.startWidth + resize.startX - event.clientX
        : handleResizesFromRight(resize.handle)
          ? resize.startWidth + event.clientX - resize.startX
          : resize.startWidth;
      const nextHeight = handleResizesFromTop(resize.handle)
        ? resize.startHeight + resize.startY - event.clientY
        : handleResizesFromBottom(resize.handle)
          ? resize.startHeight + event.clientY - resize.startY
          : resize.startHeight;

      const nextSize = clampPanelSize({
        width: nextWidth,
        height: nextHeight,
      });
      const nextOffset = {
        ...resize.startOffset,
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
        // Pointer capture is best-effort; the browser may have already released it.
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
    const dragPanel = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

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

      setPanelOffset({
        x: left - drag.anchorLeft,
        y: top - drag.anchorTop,
      });
    };

    const stopDrag = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", dragPanel);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", dragPanel);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      stopDrag();
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleViewportResize = () => {
      if (isFullscreen) return;
      setPanelSize((current) => {
        const nextSize = clampPanelSize(current);
        setPanelOffset((offset) => clampPanelOffset(offset, nextSize));
        return nextSize;
      });
    };

    window.addEventListener("resize", handleViewportResize);

    return () => window.removeEventListener("resize", handleViewportResize);
  }, [isFullscreen, open]);

  const openPanel = useCallback(() => {
    setOpen(true);
    onOpen?.();
  }, [onOpen]);

  const closePanel = useCallback(() => {
    restoreLauncherFocus.current = true;
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((current) => !current);
  }, []);

  const handlePanelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      closePanel();
    },
    [closePanel],
  );

  const startPanelResize = useCallback(
    (handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (isFullscreen) return;
      if (event.button !== 0) return;

      event.currentTarget.setPointerCapture(event.pointerId);

      resizeRef.current = {
        hasDragged: false,
        handle,
        pointerId: event.pointerId,
        startOffset: panelOffsetRef.current,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: panelSize.width,
        startHeight: panelSize.height,
        target: event.currentTarget,
      };
    },
    [isFullscreen, panelSize.height, panelSize.width],
  );

  const startPanelDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (isFullscreen || event.button !== 0 || window.innerWidth < 640) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'button, a, input, textarea, select, [role="button"], [data-sidechat-no-drag="true"]',
        )
      ) {
        return;
      }

      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;

      event.preventDefault();
      const currentOffset = panelOffsetRef.current;

      dragRef.current = {
        anchorLeft: rect.left - currentOffset.x,
        anchorTop: rect.top - currentOffset.y,
        height: rect.height,
        startLeft: rect.left,
        startTop: rect.top,
        startX: event.clientX,
        startY: event.clientY,
        width: rect.width,
      };
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [isFullscreen],
  );

  return {
    closePanel,
    handlePanelKeyDown,
    isFullscreen,
    launcherButtonRef,
    open,
    openPanel,
    panelOffset,
    panelRef,
    panelSize,
    startPanelDrag,
    startPanelResize,
    toggleFullscreen,
  };
};
