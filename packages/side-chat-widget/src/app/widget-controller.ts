import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { loadConversationHistory } from "./flows/load-history-flow.js";
import { resetConversation } from "./flows/reset-conversation-flow.js";
import {
  createDefaultRequest,
  runChatStream,
  type RunChatStreamOptions,
} from "./flows/send-message-flow.js";
import { refreshUsage } from "./flows/usage-flow.js";
import type {
  SideChatWidgetAssistantProfile,
  SideChatWidgetIdentity,
  SideChatWidgetPanelActions,
  SideChatWidgetPanelSize,
  SideChatWidgetStateSnapshot,
} from "./widget.types.js";
import type { ChatClient } from "@side-chat/chat-client";
import type { HostBridge } from "@side-chat/host-bridge";
import type {
  ChatStreamRequest,
  HostContext,
  UsageMetadata,
} from "@side-chat/chat-protocol";
import {
  normalizeAssistantProfiles,
  resolveAssistantProfileId,
} from "#features/composer/model/model-selection";
import {
  initialWidgetState,
  sideChatReducer,
  type WidgetState,
} from "#features/conversation/model/conversation-state";
import type { PanelHeaderActions } from "#features/panel/model/panel-actions";
import {
  usePanelShell,
  type PanelShellController,
  type UsePanelShellOptions,
} from "#features/panel/ui/use-panel-shell";
import { omitUndefined } from "#shared/lib/omit-undefined";

export type SideChatWidgetController = {
  readonly assistantProfileId: string;
  readonly assistantProfiles: readonly SideChatWidgetAssistantProfile[];
  readonly conversationState: WidgetState;
  readonly disabled: boolean;
  readonly onDismissError: () => void;
  readonly onQuickActionSelect: (
    prompt: string,
    displayContent?: string,
  ) => void;
  readonly onRetry: () => void;
  readonly onSelectAssistantProfile: (profileId: string) => void;
  readonly onSubmit: (message: string, displayContent?: string) => void;
  readonly panelHeaderActions: PanelHeaderActions;
  readonly panel: PanelShellController;
};

export type UseSideChatWidgetControllerOptions = {
  readonly assistantProfiles?: readonly SideChatWidgetAssistantProfile[];
  readonly client: ChatClient;
  readonly defaultAssistantProfileId?: string;
  readonly defaultOpen?: boolean;
  readonly defaultPanelSize?: SideChatWidgetPanelSize;
  readonly hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">;
  readonly identity?: SideChatWidgetIdentity;
  readonly initialConversationId?: string;
  readonly initialState?: SideChatWidgetStateSnapshot;
  readonly onError?: (message: string) => void;
  readonly onOpen?: () => void;
  readonly onUsage?: (usage: UsageMetadata) => void;
  readonly panelActions?: SideChatWidgetPanelActions;
  readonly requestFactory?: (
    message: string,
    hostContext?: HostContext,
  ) => ChatStreamRequest;
};

export const useSideChatWidgetController = ({
  client,
  assistantProfiles,
  defaultAssistantProfileId,
  defaultOpen,
  defaultPanelSize,
  hostBridge,
  identity,
  initialState,
  initialConversationId,
  onError,
  onOpen,
  onUsage,
  panelActions,
  requestFactory = createDefaultRequest,
}: UseSideChatWidgetControllerOptions): SideChatWidgetController => {
  const normalizedInitialState = useMemo<WidgetState>(
    () => createInitialWidgetState(initialState),
    [initialState],
  );
  const [conversationState, dispatchConversation] = useReducer(
    sideChatReducer,
    normalizedInitialState,
  );
  const profiles = useMemo(
    () => normalizeAssistantProfiles(assistantProfiles),
    [assistantProfiles],
  );
  const [assistantProfileId, setAssistantProfileId] = useState(() =>
    resolveAssistantProfileId(defaultAssistantProfileId, profiles),
  );
  const initialHistoryConversationId =
    identity?.conversationId ?? initialConversationId;
  const conversationId =
    conversationState.conversationId ?? initialHistoryConversationId;
  const disabled = conversationState.status === "streaming";
  const resolvedOnOpen = onOpen ?? panelActions?.onOpen;
  const panel = usePanelShell(
    omitUndefined({
      defaultOpen,
      defaultSize: defaultPanelSize,
      onClose: panelActions?.onClose,
      onOpen: resolvedOnOpen,
    }) as UsePanelShellOptions,
  );

  useEffect(() => {
    setAssistantProfileId((current) =>
      resolveAssistantProfileId(current, profiles),
    );
  }, [profiles]);

  useEffect(() => {
    void loadConversationHistory({
      client,
      dispatch: dispatchConversation,
      ...(initialHistoryConversationId
        ? { conversationId: initialHistoryConversationId }
        : {}),
    });
  }, [client, initialHistoryConversationId]);

  useEffect(() => {
    if (conversationState.errorMessage)
      onError?.(conversationState.errorMessage);
  }, [conversationState.errorMessage, onError]);

  useEffect(() => {
    if (conversationState.usage) onUsage?.(conversationState.usage);
  }, [conversationState.usage, onUsage]);

  const onSubmit = useCallback(
    (message: string, displayContent?: string) => {
      const options = omitUndefined({
        assistantProfileId,
        client,
        conversationId,
        dispatch: dispatchConversation,
        displayContent,
        hostBridge,
        message,
        requestFactory,
      }) as RunChatStreamOptions;

      void runChatStream(options).then(() => {
        void refreshUsage({ client, dispatch: dispatchConversation });
      });
    },
    [assistantProfileId, client, conversationId, hostBridge, requestFactory],
  );

  const onRetry = useCallback(() => {
    if (conversationState.lastUserMessage && !disabled) {
      onSubmit(conversationState.lastUserMessage);
    }
  }, [conversationState.lastUserMessage, disabled, onSubmit]);

  const onNewChat = useCallback(() => {
    void resetConversation({
      client,
      dispatch: dispatchConversation,
      ...(conversationId ? { conversationId } : {}),
    });
    panelActions?.onNewChat?.();
  }, [client, conversationId, panelActions]);

  const onDismissError = useCallback(() => {
    dispatchConversation({ type: "error_dismissed" });
  }, []);

  const onSelectAssistantProfile = useCallback(
    (profileId: string) => {
      setAssistantProfileId(resolveAssistantProfileId(profileId, profiles));
      dispatchConversation({ type: "error_dismissed" });
    },
    [profiles],
  );

  const panelHeaderActions = usePanelHeaderActions({
    onClose: panel.closePanel,
    onNewChat,
    onOpenSettings: panelActions?.onOpenSettings ?? panel.toggleSettings,
    onToggleExpanded: panel.toggleFullscreen,
  });

  return {
    assistantProfileId,
    assistantProfiles: profiles,
    conversationState,
    disabled,
    onDismissError,
    onQuickActionSelect: onSubmit,
    onRetry,
    onSelectAssistantProfile,
    onSubmit,
    panel,
    panelHeaderActions,
  };
};

const createInitialWidgetState = (
  initialState: SideChatWidgetStateSnapshot | undefined,
): WidgetState => ({
  ...initialWidgetState,
  ...(initialState ?? {}),
  historyStatus:
    initialState?.historyStatus ?? initialWidgetState.historyStatus,
});

const usePanelHeaderActions = (
  actions: SideChatWidgetPanelActions,
): PanelHeaderActions => {
  const onClose = actions.onClose;
  const onNewChat = actions.onNewChat;
  const onOpenSettings = actions.onOpenSettings;
  const onToggleExpanded = actions.onToggleExpanded;

  return useMemo(
    () => ({
      ...(onClose ? { onClose } : {}),
      ...(onNewChat ? { onNewChat } : {}),
      ...(onOpenSettings ? { onOpenSettings } : {}),
      ...(onToggleExpanded ? { onToggleExpanded } : {}),
    }),
    [onClose, onNewChat, onOpenSettings, onToggleExpanded],
  );
};
