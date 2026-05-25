import type { PanelOffset, PanelSize } from "./panel-geometry.js";

export type PanelMode = "expanded" | "floating";
export type PanelVisibility = "closed" | "minimized" | "open";

export type PanelResizeState =
  | { readonly status: "idle" }
  | {
      readonly height: number;
      readonly status: "resizing";
      readonly width: number;
    };

export type PanelState = {
  readonly mode: PanelMode;
  readonly offset: PanelOffset;
  readonly resize: PanelResizeState;
  readonly settingsOpen: boolean;
  readonly size: PanelSize;
  readonly visibility: PanelVisibility;
};

export const initialPanelState: PanelState = {
  mode: "floating",
  offset: { x: 0, y: 0 },
  resize: { status: "idle" },
  settingsOpen: false,
  size: { width: 640, height: 760 },
  visibility: "closed",
};
