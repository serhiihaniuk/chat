import { Effect, Stream } from "effect";
import type { SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { PartnerAiCoreError } from "#errors";
import { partnerAiCoreServicesEffect, type PartnerAiCoreServices } from "#services/effect-runtime";
import { createProtocolEventStream } from "./protocol/protocol-event-stream.js";
import { prepareStreamChatTurn } from "./turn/prepare-stream-chat-turn.js";
import type { StreamChatInput, StreamChatPorts } from "./stream-chat-types.js";

export type {
  PreparedStreamChatTurn,
  StreamChatInput,
  StreamChatPorts,
} from "./stream-chat-types.js";

/**
 * Native Effect entrypoint for the stream-chat use case.
 *
 * This is the core package's preferred shape: dependencies come from Effect
 * services, expected failures stay typed as PartnerAiCoreError, and emitted
 * protocol events remain a Stream for the whole assistant turn.
 */
export const streamChatEffect = (
  input: StreamChatInput,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError, PartnerAiCoreServices> => {
  const resolvedServices = Effect.map(partnerAiCoreServicesEffect, (ports) =>
    createStreamChatStream(ports, input),
  );
  return Stream.unwrap(resolvedServices);
};

/**
 * Build the stream from already-resolved services.
 *
 * This stays private so package consumers use the final architecture: provide
 * app-owned ports through an Effect Layer and call `streamChatEffect(input)`.
 */
const createStreamChatStream = (
  ports: StreamChatPorts,
  input: StreamChatInput,
): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> => {
  const preparedTurn = Effect.map(prepareStreamChatTurn(ports, input), (turn) =>
    createProtocolEventStream(ports, input, turn),
  );
  return Stream.unwrap(preparedTurn);
};
