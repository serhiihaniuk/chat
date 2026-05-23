import type { PanelAction } from "./panel-actions.js";
import type { PanelState } from "./panel-state.js";

export const panelReducer = (
  state: PanelState,
  action: PanelAction,
): PanelState => {
  switch (action.type) {
    case "close":
      return { ...state, settingsOpen: false, visibility: "closed" };
    case "minimize":
      return { ...state, settingsOpen: false, visibility: "minimized" };
    case "new_chat":
      return state;
    case "toggle_expanded":
      return {
        ...state,
        mode: state.mode === "expanded" ? "floating" : "expanded",
      };
    case "toggle_settings":
      return { ...state, settingsOpen: !state.settingsOpen };
    case "resize_started":
      return state.resize.status === "resizing"
        ? state
        : { ...state, resize: { height: 0, status: "resizing", width: 0 } };
    case "resize_changed":
      return {
        ...state,
        resize: {
          height: action.height,
          status: "resizing",
          width: action.width,
        },
      };
    case "resize_committed":
      return { ...state, resize: { status: "idle" } };
  }
};
