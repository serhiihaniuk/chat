import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  createId,
  createWidgetChatRequest,
  createWidgetMessage,
  findLastUserMessage,
  messagesBeforeMessage,
  type WidgetMessage,
  type WidgetStatus,
} from "#entities/chat";
import type { ChatModelPreference } from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";

import type { WidgetRunController } from "./reconnect/widget-run-controller.js";

type SetError = Dispatch<SetStateAction<string | undefined>>;
type MutableConversationRef = { current: string | undefined };
type PendingTitleRef = { current: string | undefined };

export type WidgetChatActionsInput = {
  readonly controller: WidgetRunController;
  readonly hostBridge: Pick<HostBridge, "getContext" | "dispatchCommand"> | undefined;
  readonly conversationId: string | undefined;
  readonly selectedProfileId: string | undefined;
  readonly selectedModel: ChatModelPreference | undefined;
  readonly status: WidgetStatus;
  readonly visibleMessages: readonly WidgetMessage[];
  readonly visibleMessagesRef: MutableRefObject<readonly WidgetMessage[]>;
  readonly setConversationId: Dispatch<SetStateAction<string | undefined>>;
  readonly setErrorMessage: SetError;
  readonly streamOwnedConversationRef: MutableConversationRef;
  readonly pendingConversationTitleRef: PendingTitleRef;
};

export type WidgetChatActions = {
  readonly submitMessage: (messageText: string) => Promise<void>;
  readonly selectConversation: (nextConversationId: string | undefined) => void;
  readonly startNewConversation: () => void;
  readonly stop: () => void;
  readonly clearError: () => void;
  readonly retryLastMessage: () => void;
};

/**
 * User-facing chat actions, kept out of the main hook so each stays small.
 *
 * Submitting and retrying both flow through `startTurn`, which seeds the run with
 * the prior transcript (the run store holds only the current run). Selecting a
 * conversation asks the controller to resume any live run for it; stop cancels
 * the live turn on the server rather than just dropping the socket.
 */
export const useWidgetChatActions = (input: WidgetChatActionsInput): WidgetChatActions => {
  const {
    controller,
    hostBridge,
    conversationId,
    selectedProfileId,
    selectedModel,
    status,
    visibleMessages,
    visibleMessagesRef,
    setConversationId,
    setErrorMessage,
    streamOwnedConversationRef,
    pendingConversationTitleRef,
  } = input;

  const startTurn = useCallback(
    async (messageText: string, baseMessages: readonly WidgetMessage[]) => {
      const ids = createTurnIds();
      const userMessage = createWidgetMessage(ids.userMessageId, "user", messageText);
      const assistantMessage = createWidgetMessage(ids.assistantMessageId, "assistant", "", true);

      pendingConversationTitleRef.current = messageText;
      setErrorMessage(undefined);

      const hostContext = await hostBridge?.getContext({ requestId: ids.requestId });
      await controller.startRun({
        request: createWidgetChatRequest({
          turnProfileId: selectedProfileId,
          conversationId,
          hostContext,
          message: messageText,
          messageId: ids.userMessageId,
          model: selectedModel,
          requestId: ids.requestId,
        }),
        localUserMessageId: ids.userMessageId,
        localAssistantMessageId: ids.assistantMessageId,
        messages: [...baseMessages, userMessage, assistantMessage],
      });
    },
    [
      conversationId,
      controller,
      hostBridge,
      pendingConversationTitleRef,
      selectedModel,
      selectedProfileId,
      setErrorMessage,
    ],
  );

  const submitMessage = useCallback(
    async (messageText: string) => {
      const trimmed = messageText.trim();
      if (isSubmitBlocked(trimmed, status)) return;
      await startTurn(trimmed, visibleMessagesRef.current);
    },
    [startTurn, status, visibleMessagesRef],
  );

  const selectConversation = useCallback(
    (nextConversationId: string | undefined) => {
      pendingConversationTitleRef.current = undefined;
      // Explicit selection always wants fresh history, so release the no-refetch guard.
      streamOwnedConversationRef.current = undefined;
      setConversationId(nextConversationId);
      setErrorMessage(undefined);
      // A run may be live for the selected conversation; resume tailing it.
      controller.reconnect();
    },
    [
      controller,
      pendingConversationTitleRef,
      setConversationId,
      setErrorMessage,
      streamOwnedConversationRef,
    ],
  );

  const startNewConversation = useCallback(
    () => selectConversation(undefined),
    [selectConversation],
  );

  const stop = useCallback(() => {
    void controller.cancel();
  }, [controller]);

  const clearError = useCallback(() => setErrorMessage(undefined), [setErrorMessage]);

  const retryLastMessage = useCallback(() => {
    const lastUserMessage = findLastUserMessage(visibleMessages);
    if (!lastUserMessage) return;
    // Drop the failed exchange, then resubmit the same prompt onto the rest.
    const priorMessages = messagesBeforeMessage(visibleMessages, lastUserMessage);
    controller.clearRun();
    setErrorMessage(undefined);
    void startTurn(lastUserMessage.content, priorMessages);
  }, [controller, setErrorMessage, startTurn, visibleMessages]);

  return {
    submitMessage,
    selectConversation,
    startNewConversation,
    stop,
    clearError,
    retryLastMessage,
  };
};

const createTurnIds = (): {
  readonly requestId: string;
  readonly userMessageId: string;
  readonly assistantMessageId: string;
} => ({
  requestId: createId("request"),
  userMessageId: createId("user"),
  assistantMessageId: createId("assistant"),
});

const isSubmitBlocked = (message: string, status: WidgetStatus): boolean =>
  !message || status === "submitted" || status === "streaming";
