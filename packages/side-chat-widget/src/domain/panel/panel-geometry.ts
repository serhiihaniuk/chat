/**
 * Pure panel geometry rules. Keeping viewport math here lets the React shell
 * manage pointer events while this file owns the reusable sizing constraints.
 */
export const panelId = "side-chat-widget-panel";
export const defaultPanelWidth = 600;
export const minPanelSize = { width: 560, height: 560 };
export const viewportGutter = 32;
export const panelInset = 20;
export const panelDragGutter = 12;
export const defaultPanelHeightRatio = 0.75;

export type ResizeHandle =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right";

export type PanelOffset = { x: number; y: number };
export type PanelSize = { width: number; height: number };

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const clampPanelSize = (size: PanelSize): PanelSize => {
  const maxWidth =
    typeof window === "undefined"
      ? defaultPanelWidth
      : window.innerWidth - viewportGutter;
  const maxHeight =
    typeof window === "undefined"
      ? 840
      : window.innerHeight - viewportGutter;

  return {
    width: Math.min(Math.max(size.width, minPanelSize.width), maxWidth),
    height: Math.min(Math.max(size.height, minPanelSize.height), maxHeight),
  };
};

export const getDefaultPanelSize = () =>
  clampPanelSize({
    width: defaultPanelWidth,
    height:
      typeof window === "undefined"
        ? 840
        : Math.round(window.innerHeight * defaultPanelHeightRatio),
  });

export const handleResizesFromLeft = (handle: ResizeHandle) =>
  handle === "left" || handle === "top-left";

export const handleResizesFromRight = (handle: ResizeHandle) =>
  handle === "right" || handle === "top-right";

export const handleResizesFromTop = (handle: ResizeHandle) =>
  handle === "top" || handle === "top-left" || handle === "top-right";

export const handleResizesFromBottom = (handle: ResizeHandle) =>
  handle === "bottom";

export const getResizeCursor = (handle: ResizeHandle) => {
  if (handle === "top-left") return "nwse-resize";
  if (handle === "top-right") return "nesw-resize";
  if (handle === "top" || handle === "bottom") return "ns-resize";
  return "ew-resize";
};

export const getPanelAnchorPosition = (size: PanelSize) => {
  if (typeof window === "undefined") return { left: 0, top: 0 };

  return {
    left: window.innerWidth - panelInset - size.width,
    top: window.innerHeight - panelInset - size.height,
  };
};

export const clampPanelOffset = (
  offset: PanelOffset,
  size: PanelSize,
): PanelOffset => {
  if (typeof window === "undefined") return offset;

  const anchor = getPanelAnchorPosition(size);
  const maxLeft = Math.max(
    panelDragGutter,
    window.innerWidth - size.width - panelDragGutter,
  );
  const maxTop = Math.max(
    panelDragGutter,
    window.innerHeight - size.height - panelDragGutter,
  );
  const left = clamp(anchor.left + offset.x, panelDragGutter, maxLeft);
  const top = clamp(anchor.top + offset.y, panelDragGutter, maxTop);

  return {
    x: left - anchor.left,
    y: top - anchor.top,
  };
};
