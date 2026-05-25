import type { PanelAction } from "./panel-actions.js";
import type { PanelState } from "./panel-state.js";

export const panelReducer = (
  state: PanelState,
  action: PanelAction,
): PanelState => {
  const handler = panelActionHandlers[action.type] as PanelActionHandler;
  return handler(state, action);
};

type PanelActionType = PanelAction["type"];
type PanelActionFor<TType extends PanelActionType> = Extract<
  PanelAction,
  { readonly type: TType }
>;
type PanelActionHandler<TAction extends PanelAction = PanelAction> = (
  state: PanelState,
  action: TAction,
) => PanelState;

const panelActionHandlers: {
  readonly [TType in PanelActionType]: PanelActionHandler<
    PanelActionFor<TType>
  >;
} = {
  close: (state) => ({ ...state, settingsOpen: false, visibility: "closed" }),
  minimize: (state) => ({
    ...state,
    settingsOpen: false,
    visibility: "minimized",
  }),
  new_chat: (state) => state,
  offset_changed: (state, action) => {
    if (
      state.offset.x === action.offset.x &&
      state.offset.y === action.offset.y
    ) {
      return state;
    }
    return { ...state, offset: action.offset };
  },
  open: (state) => ({ ...state, visibility: "open" }),
  resize_changed: (state, action) => {
    if (
      state.size.width === action.width &&
      state.size.height === action.height
    ) {
      return state;
    }
    return {
      ...state,
      resize: {
        height: action.height,
        status: "resizing",
        width: action.width,
      },
      size: {
        height: action.height,
        width: action.width,
      },
    };
  },
  resize_committed: (state) => ({ ...state, resize: { status: "idle" } }),
  resize_started: (state) => {
    if (state.resize.status === "resizing") return state;
    return { ...state, resize: { height: 0, status: "resizing", width: 0 } };
  },
  toggle_expanded: (state) => ({
    ...state,
    mode: state.mode === "expanded" ? "floating" : "expanded",
  }),
  toggle_settings: (state) => ({
    ...state,
    settingsOpen: !state.settingsOpen,
  }),
};
