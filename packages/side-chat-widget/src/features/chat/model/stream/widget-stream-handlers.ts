import type { HostBridge } from "@side-chat/host-bridge";
import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { WidgetMessage, WidgetStatus, WidgetUsage } from "#entities/chat";
import { useWidgetStreamEvents } from "./widget-stream-events.js";

type SetWidgetError = Dispatch<SetStateAction<string | undefined>>;
type SetWidgetConversationId = Dispatch<SetStateAction<string | undefined>>;
type SetWidgetStatus = Dispatch<SetStateAction<WidgetStatus>>;
type SetWidgetUsage = Dispatch<SetStateAction<WidgetUsage | undefined>>;
type PendingConversationTitleRef = { readonly current: string | undefined };
type MutableConversationRef = { current: string | undefined };

type UpsertStartedConversation = (input: {
  readonly conversationId: string;
  readonly fallbackTitle: string;
  readonly lastMessageAt: string;
}) => void;

export const useWidgetStreamEventHandlers = ({
  hostBridge,
  pendingConversationTitleRef,
  setConversationId,
  setErrorMessage,
  setMessages,
  setStatus,
  setUsage,
  streamOwnedConversationRef,
  upsertStartedConversation,
}: {
  readonly hostBridge: Pick<HostBridge, "dispatchCommand"> | undefined;
  readonly pendingConversationTitleRef: PendingConversationTitleRef;
  readonly setConversationId: SetWidgetConversationId;
  readonly setErrorMessage: SetWidgetError;
  readonly setMessages: Dispatch<SetStateAction<WidgetMessage[]>>;
  readonly setStatus: SetWidgetStatus;
  readonly setUsage: SetWidgetUsage;
  readonly streamOwnedConversationRef: MutableConversationRef;
  readonly upsertStartedConversation: UpsertStartedConversation;
}) => {
  const recordStartedConversation = useCallback(
    (startedConversationId: string, createdAt: string) => {
      streamOwnedConversationRef.current = startedConversationId;
      setConversationId(startedConversationId);
      const fallbackTitle = pendingConversationTitleRef.current;
      if (!fallbackTitle) return;
      upsertStartedConversation({
        conversationId: startedConversationId,
        fallbackTitle,
        lastMessageAt: createdAt,
      });
    },
    [
      pendingConversationTitleRef,
      setConversationId,
      streamOwnedConversationRef,
      upsertStartedConversation,
    ],
  );

  return useWidgetStreamEvents(
    {
      onConversationStarted: recordStartedConversation,
      onStreamCompleted: () => {
        setStatus("idle");
      },
      setErrorMessage,
      setMessages,
      setStatus,
      setUsage,
    },
    hostBridge,
  );
};
