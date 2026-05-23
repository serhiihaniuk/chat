export type PanelHeaderActions = {
  readonly onClose?: () => void;
  readonly onNewChat?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onToggleExpanded?: () => void;
};

export type PanelAction =
  | { readonly type: "close" }
  | { readonly type: "minimize" }
  | { readonly type: "new_chat" }
  | { readonly type: "toggle_expanded" }
  | { readonly type: "toggle_settings" }
  | { readonly type: "resize_started" }
  | {
      readonly height: number;
      readonly type: "resize_changed";
      readonly width: number;
    }
  | { readonly type: "resize_committed" };
