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
  readonly resize: PanelResizeState;
  readonly settingsOpen: boolean;
  readonly visibility: PanelVisibility;
};

export const initialPanelState: PanelState = {
  mode: "floating",
  resize: { status: "idle" },
  settingsOpen: false,
  visibility: "open",
};
