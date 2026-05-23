export type PanelMode = "inline" | "overlay";

export type PanelState = {
  readonly mode: PanelMode;
  readonly expanded: boolean;
};

export const defaultPanelState: PanelState = {
  mode: "inline",
  expanded: true,
};
