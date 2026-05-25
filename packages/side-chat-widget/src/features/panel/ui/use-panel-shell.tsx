import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  createDragSession,
  createResizeSession,
  type DragSession,
  nextDragOffset,
  nextResizeHeight,
  nextResizeOffset,
  nextResizeWidth,
  releasePointer,
  type ResizeSession,
} from "../model/panel-pointer.js";
import type { PanelAction } from "../model/panel-actions.js";
import { panelReducer } from "../model/panel-reducer.js";
import { initialPanelState, type PanelState } from "../model/panel-state.js";
import {
  clampPanelOffset,
  clampPanelSize,
  getDefaultPanelSize,
  getResizeCursor,
  type PanelOffset,
  type PanelSize,
  type ResizeHandle,
} from "../model/panel-geometry.js";

export type UsePanelShellOptions = {
  readonly defaultOpen?: boolean;
  readonly defaultSize?: PanelSize;
  readonly onClose?: () => void;
  readonly onOpen?: () => void;
};

export type PanelShellController = {
  readonly closePanel: () => void;
  readonly handlePanelKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly launcherButtonRef: RefObject<HTMLButtonElement | null>;
  readonly openPanel: () => void;
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly startPanelDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly startPanelResize: (
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  readonly state: PanelState;
  readonly toggleFullscreen: () => void;
  readonly toggleSettings: () => void;
};

export const usePanelShell = ({
  defaultOpen = false,
  defaultSize,
  onClose,
  onOpen,
}: UsePanelShellOptions = {}): PanelShellController => {
  const [state, dispatch] = useReducer(panelReducer, {
    ...initialPanelState,
    size: getDefaultPanelSize(defaultSize),
    visibility: defaultOpen ? "open" : "closed",
  });
  const panelRef = useRef<HTMLElement>(null);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const restoreLauncherFocus = useRef(false);
  const stateRef = useRef(state);
  const resizeRef = useRef<ResizeSession | null>(null);
  const dragRef = useRef<DragSession | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state.visibility !== "closed" || !restoreLauncherFocus.current) return;
    launcherButtonRef.current?.focus({ preventScroll: true });
    restoreLauncherFocus.current = false;
  }, [state.visibility]);

  useEffect(() => {
    if (state.visibility !== "open") return;
    const size = clampPanelSize(state.size);
    dispatchSizeAndOffset(size, clampPanelOffset(state.offset, size), dispatch);
  }, [state.offset, state.size, state.visibility]);

  useResizeLifecycle(resizeRef, dispatch);
  useDragLifecycle(dragRef, dispatch);
  useViewportClamp(state.visibility, stateRef, dispatch);

  const openPanel = useCallback(() => {
    dispatch({ type: "open" });
    onOpen?.();
  }, [onOpen]);

  const closePanel = useCallback(() => {
    restoreLauncherFocus.current = true;
    dispatch({ type: "close" });
    onClose?.();
  }, [onClose]);

  const toggleFullscreen = useCallback(() => {
    dispatch({ type: "toggle_expanded" });
  }, []);

  const toggleSettings = useCallback(() => {
    dispatch({ type: "toggle_settings" });
  }, []);

  const handlePanelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>): void => {
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
      if (event.button !== 0 || stateRef.current.mode === "expanded") return;

      event.currentTarget.setPointerCapture(event.pointerId);
      resizeRef.current = createResizeSession(handle, event, stateRef.current);
      dispatch({ type: "resize_started" });
    },
    [],
  );

  const startPanelDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (event.button !== 0 || stateRef.current.mode === "expanded") return;
      if (isInteractiveTarget(event.target)) return;
      const panel = panelRef.current;
      if (!panel) return;

      dragRef.current = createDragSession(
        panel,
        event,
        stateRef.current.offset,
      );
      document.body.style.cursor = "move";
      document.body.style.userSelect = "none";
    },
    [],
  );

  return {
    closePanel,
    handlePanelKeyDown,
    launcherButtonRef,
    openPanel,
    panelRef,
    startPanelDrag,
    startPanelResize,
    state,
    toggleFullscreen,
    toggleSettings,
  };
};

const isInteractiveTarget = (target: EventTarget): boolean =>
  target instanceof Element &&
  Boolean(target.closest("button, a, input, select, textarea"));

type PanelDispatch = Dispatch<PanelAction>;

const useResizeLifecycle = (
  resizeRef: MutableRefObject<ResizeSession | null>,
  dispatch: PanelDispatch,
): void => {
  useEffect(() => {
    const stopResize = (): void => {
      releasePointer(resizeRef.current);
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      dispatch({ type: "resize_committed" });
    };

    const resizePanel = (event: PointerEvent): void => {
      const resize = resizeRef.current;
      if (!resize) return;
      const distance = Math.hypot(
        event.clientX - resize.startX,
        event.clientY - resize.startY,
      );
      if (!resize.hasDragged && distance < 4) return;
      resize.hasDragged = true;
      document.body.style.cursor = getResizeCursor(resize.handle);
      document.body.style.userSelect = "none";

      const size = clampPanelSize({
        width: nextResizeWidth(resize, event),
        height: nextResizeHeight(resize, event),
      });
      dispatchSizeAndOffset(
        size,
        clampPanelOffset(nextResizeOffset(resize, size), size),
        dispatch,
      );
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
  }, [dispatch, resizeRef]);
};

const useDragLifecycle = (
  dragRef: MutableRefObject<DragSession | null>,
  dispatch: PanelDispatch,
): void => {
  useEffect(() => {
    const stopDrag = (): void => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const dragPanel = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      dispatch({
        type: "offset_changed",
        offset: nextDragOffset(drag, event),
      });
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
  }, [dispatch, dragRef]);
};

const useViewportClamp = (
  visibility: PanelState["visibility"],
  stateRef: MutableRefObject<PanelState>,
  dispatch: PanelDispatch,
): void => {
  useEffect(() => {
    if (visibility !== "open") return undefined;
    const clampToViewport = (): void => {
      const current = stateRef.current;
      if (current.mode === "expanded") return;
      const size = clampPanelSize(current.size);
      dispatchSizeAndOffset(
        size,
        clampPanelOffset(current.offset, size),
        dispatch,
      );
    };

    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [dispatch, stateRef, visibility]);
};

const dispatchSizeAndOffset = (
  size: PanelSize,
  offset: PanelOffset,
  dispatch: PanelDispatch,
): void => {
  dispatch({ type: "resize_changed", width: size.width, height: size.height });
  dispatch({ type: "offset_changed", offset });
};
