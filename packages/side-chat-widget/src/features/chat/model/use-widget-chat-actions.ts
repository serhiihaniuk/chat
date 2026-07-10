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
import type { ChatModelPreference, RequestHostCommand } from "@side-chat/chat-protocol";
import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type { WidgetRunController } from "./reconnect/widget-run-controller.js";
import type { RunShellBridge } from "./conversation/shell/run-shell-bridge.js";

type SetError = Dispatch<SetStateAction<string | undefined>>;

export type WidgetChatActionsInput = {
  readonly controller: WidgetRunController;
  readonly hostBridge: WidgetHostBridge | undefined;
  readonly conversationId: string | undefined;
  readonly selectedProfileId: string | undefined;
  readonly selectedModel: ChatModelPreference | undefined;
  readonly enabledToolNames: readonly string[] | undefined;
  readonly status: WidgetStatus;
  readonly visibleMessages: readonly WidgetMessage[];
  readonly visibleMessagesRef: MutableRefObject<readonly WidgetMessage[]>;
  readonly setConversationId: Dispatch<SetStateAction<string | undefined>>;
  readonly setErrorMessage: SetError;
  /** Shared run↔shell state (stream-owned conversation, pending title). */
  readonly shellBridge: RunShellBridge;
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
    enabledToolNames,
    status,
    visibleMessages,
    visibleMessagesRef,
    setConversationId,
    setErrorMessage,
    shellBridge,
  } = input;

  const startTurn = useCallback(
    async (messageText: string, baseMessages: readonly WidgetMessage[]) => {
      const ids = createTurnIds();
      const userMessage = createWidgetMessage(ids.userMessageId, "user", messageText);
      const assistantMessage = createWidgetMessage(ids.assistantMessageId, "assistant", "", true);

      shellBridge.markTurnSubmitted(messageText);
      setErrorMessage(undefined);

      const hostContext = await hostBridge?.getContext({ requestId: ids.requestId });
      const hostCommands = await readHostCommands(hostBridge);
      await controller.startRun({
        request: createWidgetChatRequest({
          turnProfileId: selectedProfileId,
          conversationId,
          hostContext,
          hostCommands,
          enabledToolNames,
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
      enabledToolNames,
      hostBridge,
      selectedModel,
      selectedProfileId,
      setErrorMessage,
      shellBridge,
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
      // Explicit selection always wants fresh history and no stale optimistic title.
      shellBridge.resetForConversationSelection();
      setConversationId(nextConversationId);
      setErrorMessage(undefined);
      // A run may be live for the selected conversation; resume tailing it.
      controller.reconnect();
    },
    [controller, setConversationId, setErrorMessage, shellBridge],
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

/**
 * Ask the host which commands are available for this turn.
 *
 * The host owns its command set and it can vary by page, so the widget reads it
 * per turn and forwards the model-callable definitions on the request. A host
 * that does not declare commands simply omits `getCapabilities`.
 */
const readHostCommands = async (
  hostBridge: WidgetHostBridge | undefined,
): Promise<readonly RequestHostCommand[] | undefined> => {
  const capabilities = await hostBridge?.getCapabilities?.();
  return capabilities?.commands.map((command) => ({
    commandName: command.commandName,
    description: command.description,
    inputSchema: command.inputSchema,
  }));
};
