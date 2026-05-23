import { useCallback, useMemo, useReducer } from "react";

import {
  createDefaultRequest,
  runChatStream,
} from "./flows/send-message-flow.js";
import type {
  SideChatWidgetPanelActions,
  SideChatWidgetProps,
  SideChatWidgetStateSnapshot,
} from "./widget.types.js";
import {
  initialWidgetState,
  sideChatReducer,
  type WidgetState,
} from "#features/conversation/model/conversation-state";
import type { PanelHeaderActions } from "#features/panel/model/panel-actions";
import { panelReducer } from "#features/panel/model/panel-reducer";
import {
  initialPanelState,
  type PanelState,
} from "#features/panel/model/panel-state";

export type SideChatWidgetController = {
  readonly conversationState: WidgetState;
  readonly disabled: boolean;
  readonly onQuickActionSelect: (prompt: string) => void;
  readonly onSubmit: (message: string) => void;
  readonly panelHeaderActions: PanelHeaderActions;
  readonly panelState: PanelState;
};

export type UseSideChatWidgetControllerOptions = Pick<
  SideChatWidgetProps,
  "client" | "hostBridge" | "panelActions" | "requestFactory"
> & {
  readonly initialState?: SideChatWidgetStateSnapshot;
};

export const useSideChatWidgetController = ({
  client,
  hostBridge,
  initialState,
  panelActions,
  requestFactory = createDefaultRequest,
}: UseSideChatWidgetControllerOptions): SideChatWidgetController => {
  const [conversationState, dispatchConversation] = useReducer(
    sideChatReducer,
    initialState ?? initialWidgetState,
  );
  const [panelState, dispatchPanel] = useReducer(
    panelReducer,
    initialPanelState,
  );
  const disabled = conversationState.status === "streaming";

  const onSubmit = useCallback(
    (message: string) => {
      void runChatStream({
        client,
        dispatch: dispatchConversation,
        message,
        requestFactory,
        ...(hostBridge ? { hostBridge } : {}),
      });
    },
    [client, hostBridge, requestFactory],
  );

  const panelHeaderActions = usePanelHeaderActions(panelActions, dispatchPanel);

  return {
    conversationState,
    disabled,
    onQuickActionSelect: onSubmit,
    onSubmit,
    panelHeaderActions,
    panelState,
  };
};

const usePanelHeaderActions = (
  actions: SideChatWidgetPanelActions | undefined,
  dispatchPanel: (action: Parameters<typeof panelReducer>[1]) => void,
): PanelHeaderActions => {
  const onClose = actions?.onClose;
  const onNewChat = actions?.onNewChat;
  const onOpenSettings = actions?.onOpenSettings;
  const onToggleExpanded = actions?.onToggleExpanded;

  return useMemo(
    () => ({
      ...(onClose
        ? {
            onClose: () => {
              dispatchPanel({ type: "close" });
              onClose();
            },
          }
        : {}),
      ...(onNewChat
        ? {
            onNewChat: () => {
              dispatchPanel({ type: "new_chat" });
              onNewChat();
            },
          }
        : {}),
      ...(onOpenSettings
        ? {
            onOpenSettings: () => {
              dispatchPanel({ type: "toggle_settings" });
              onOpenSettings();
            },
          }
        : {}),
      ...(onToggleExpanded
        ? {
            onToggleExpanded: () => {
              dispatchPanel({ type: "toggle_expanded" });
              onToggleExpanded();
            },
          }
        : {}),
    }),
    [dispatchPanel, onClose, onNewChat, onOpenSettings, onToggleExpanded],
  );
};
