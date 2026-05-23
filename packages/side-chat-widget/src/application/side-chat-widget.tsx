import { useCallback, useReducer, type ReactElement } from "react";

import type { ChatClient } from "@side-chat/chat-client";
import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type HostCommandEvent,
  type HostContext,
} from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";

import { Composer, type ComposerLabels } from "../domain/composer/composer.js";
import {
  initialWidgetState,
  sideChatReducer,
  type WidgetState,
} from "../domain/message/state.js";
import { Feed } from "../ui/conversation/feed.js";

export type SideChatWidgetLabels = ComposerLabels & {
  readonly title?: string;
};

export type SideChatWidgetProps = {
  readonly client: ChatClient;
  readonly hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">;
  readonly initialState?: WidgetState;
  readonly labels?: SideChatWidgetLabels;
  readonly requestFactory?: (
    message: string,
    hostContext?: HostContext,
  ) => ChatStreamRequest;
};

export const SideChatWidget = ({
  client,
  hostBridge,
  initialState = initialWidgetState,
  labels = {},
  requestFactory = createDefaultRequest,
}: SideChatWidgetProps): ReactElement => {
  const [state, dispatch] = useReducer(sideChatReducer, initialState);
  const disabled = state.status === "streaming";

  const submit = useCallback(
    (message: string) => {
      void runChatStream({
        client,
        dispatch,
        message,
        requestFactory,
        ...(hostBridge ? { hostBridge } : {}),
      });
    },
    [client, hostBridge, requestFactory],
  );

  return (
    <section className="side-chat-widget" data-status={state.status}>
      <header className="side-chat-widget__header">
        <h2>{labels.title ?? "Side Chat"}</h2>
      </header>
      <Feed state={state} />
      <Composer disabled={disabled} labels={labels} onSubmit={submit} />
    </section>
  );
};

type RunChatStreamOptions = {
  readonly client: ChatClient;
  readonly dispatch: (action: Parameters<typeof sideChatReducer>[1]) => void;
  readonly hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">;
  readonly message: string;
  readonly requestFactory: (
    message: string,
    hostContext?: HostContext,
  ) => ChatStreamRequest;
};

export const runChatStream = async ({
  client,
  dispatch,
  hostBridge,
  message,
  requestFactory,
}: RunChatStreamOptions): Promise<void> => {
  try {
    const hostContext = hostBridge
      ? await hostBridge.getContext({ requestId: createId("host-request") })
      : undefined;
    const request = requestFactory(message, hostContext);
    dispatch({ type: "submit", request });
    const result = await client.streamChat(request);

    for await (const event of result.events) {
      dispatch({ type: "stream_event", event });
      if (event.type === "sidechat.host_command") {
        dispatchHostCommand(hostBridge, dispatch, event);
      }
    }
  } catch (error) {
    dispatch({ type: "stream_failed", message: readErrorMessage(error) });
  }
};

const dispatchHostCommand = (
  hostBridge: Pick<HostBridge, "dispatchCommand"> | undefined,
  dispatch: (action: Parameters<typeof sideChatReducer>[1]) => void,
  event: HostCommandEvent,
): void => {
  if (!hostBridge) return;

  void hostBridge.dispatchCommand(event).then((result) => {
    dispatch({ type: "host_command_result", result });
  });
};

const createDefaultRequest = (
  message: string,
  hostContext?: HostContext,
): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: createId("request"),
  message: {
    id: createId("message"),
    role: "user",
    content: message,
  },
  ...(hostContext ? { hostContext } : {}),
});

const createId = (prefix: string): string => {
  const randomId =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${randomId}`;
};

const readErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Chat request failed";
