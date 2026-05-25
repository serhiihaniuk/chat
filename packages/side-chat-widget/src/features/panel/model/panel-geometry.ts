export type PanelSize = {
  readonly height: number;
  readonly width: number;
};

export type PanelOffset = {
  readonly x: number;
  readonly y: number;
};

export type ResizeHandle =
  | "bottom"
  | "left"
  | "right"
  | "top"
  | "top-left"
  | "top-right";

export const panelId = "side-chat-assistant-panel";
export const panelDragGutter = 12;

const minimumSize: PanelSize = { width: 420, height: 520 };
const defaultSize: PanelSize = { width: 640, height: 760 };

export const getDefaultPanelSize = (requested?: PanelSize): PanelSize => {
  const size = requested ?? defaultSize;
  if (typeof window === "undefined") return size;
  return clampPanelSize(size);
};

export const clamp = (
  value: number,
  minimum: number,
  maximum: number,
): number => Math.min(Math.max(value, minimum), maximum);

export const clampPanelSize = (size: PanelSize): PanelSize => {
  if (typeof window === "undefined") {
    return {
      width: Math.max(minimumSize.width, size.width),
      height: Math.max(minimumSize.height, size.height),
    };
  }

  return {
    width: clamp(
      size.width,
      Math.min(minimumSize.width, window.innerWidth - 24),
      Math.max(minimumSize.width, window.innerWidth - 24),
    ),
    height: clamp(
      size.height,
      Math.min(minimumSize.height, window.innerHeight - 24),
      Math.max(minimumSize.height, window.innerHeight - 24),
    ),
  };
};

export const clampPanelOffset = (
  offset: PanelOffset,
  size: PanelSize,
): PanelOffset => {
  if (typeof window === "undefined") return offset;

  return {
    x: clamp(
      offset.x,
      panelDragGutter + size.width - window.innerWidth,
      window.innerWidth - panelDragGutter - size.width,
    ),
    y: clamp(
      offset.y,
      panelDragGutter + size.height - window.innerHeight,
      window.innerHeight - panelDragGutter - size.height,
    ),
  };
};

export const getPanelAnchorPosition = (
  panel: HTMLElement,
): { readonly left: number; readonly top: number } => {
  const rect = panel.getBoundingClientRect();
  return { left: rect.left, top: rect.top };
};

export const handleResizesFromLeft = (handle: ResizeHandle): boolean =>
  handle === "left" || handle === "top-left";

export const handleResizesFromRight = (handle: ResizeHandle): boolean =>
  handle === "right" || handle === "top-right";

export const handleResizesFromTop = (handle: ResizeHandle): boolean =>
  handle === "top" || handle === "top-left" || handle === "top-right";

export const handleResizesFromBottom = (handle: ResizeHandle): boolean =>
  handle === "bottom";

export const getResizeCursor = (handle: ResizeHandle): string => {
  if (handle === "top-left") return "nwse-resize";
  if (handle === "top-right") return "nesw-resize";
  if (handle === "left" || handle === "right") return "ew-resize";
  return "ns-resize";
};
