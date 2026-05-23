import { initialComposerState, type ComposerState } from "./composer-state.js";

export type ComposerAction =
  | { readonly message: string; readonly type: "message_changed" }
  | { readonly type: "submitted" };

export const composerReducer = (
  state: ComposerState,
  action: ComposerAction,
): ComposerState => {
  switch (action.type) {
    case "message_changed":
      return { ...state, message: action.message };
    case "submitted":
      return initialComposerState;
  }
};
