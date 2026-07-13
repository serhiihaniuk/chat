import type { UIMessageChunk } from "ai";

import { SIDE_CHAT_FINISH_REASONS, type SideChatFinishReason } from "@side-chat/stream-profile";

import type { TurnExecution, TurnExecutionTerminal } from "#application/ports/turn/turn-execution";
import { UI_MESSAGE_CHUNK_TYPES } from "#application/turn/stream/ui-message-chunk-types";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { Settings } from "#config/settings/resolve-settings";
import { sumTurnUsage, type TurnMessage, type TurnUsage } from "#domain/turn/turn";
import {
  CHAT_TURN_OUTCOMES,
  cancelChatTurn,
  chatTurnUsage,
  classifyChatTurnOutcome,
  startChatTurn,
  type ChatTurnTerminalOutcome,
  type ChatTurnWorkflowInput,
  type SerializableChatMessage,
  type StartedChatTurn,
} from "#workflows/production/chat-turn";

export type StartChatTurn = (input: ChatTurnWorkflowInput) => Promise<StartedChatTurn>;

const TURN_CANCELLATION = {
  USER_REASON: "user_requested_cancellation",
} as const;

/**
 * Adapt durable Workflow runs to the application `TurnExecution` port: launch a
 * run, re-attach the native finish reason from its terminal, and map the durable
 * outcome to the application terminal.
 *
 * @param settings - Resolved service settings; supplies the agent instructions,
 *   step cap, and provider timeout carried into each run.
 * @param startTurn - How a run is launched. Defaults to the real `startChatTurn`
 *   Workflow entry; route tests inject a fake to drive the stream and terminal directly.
 */
export function createWorkflowTurnExecution(
  settings: Settings,
  startTurn: StartChatTurn = startChatTurn,
): TurnExecution {
  return {
    async start(input) {
      if (input.clientTools.length > 0 && settings.persistence.databaseUrl === undefined) {
        throw new TurnRejectedError(
          TURN_REJECTION_CODES.CLIENT_TOOLS_UNAVAILABLE,
          "Client tools require durable persistence",
        );
      }
      const started = await startTurn({
        workspaceId: input.auth.workspaceId,
        subjectId: input.auth.subjectId,
        conversationId: input.conversationId,
        turnId: input.turnId,
        requestId: input.requestId,
        modelId: input.modelId,
        instructions: settings.agent.instructions,
        maxSteps: settings.agent.maxSteps,
        providerTimeoutMs: settings.timeouts.providerMs,
        clientToolTimeoutMs: settings.timeouts.clientToolMs,
        messages: input.messages.map(toSerializableMessage),
        clientTools: input.clientTools,
        ...(input.enabledToolNames === undefined
          ? {}
          : { enabledToolNames: input.enabledToolNames }),
      });
      const terminal = started.terminal.then(toApplicationTerminal);
      return {
        runId: started.runId,
        stream: stampFinishReason(started.stream, terminal),
        terminal,
      };
    },
    async cancel(runId) {
      const resumed = await cancelChatTurn(runId, TURN_CANCELLATION.USER_REASON);
      if (!resumed) {
        throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
      }
    },
  };
}

function toSerializableMessage(message: TurnMessage): SerializableChatMessage {
  return {
    role: message.role,
    content: message.text,
  };
}

/**
 * The route terminal and the durable workflow claim derive from one shared
 * classifier, so they cannot disagree on status, assistant-message presence, or
 * finish reason. This adds only the route-side per-step usage array; the durable
 * claim adds its folded usage from the same classification.
 */
function toApplicationTerminal(terminal: ChatTurnTerminalOutcome): TurnExecutionTerminal {
  const classification = classifyChatTurnOutcome(terminal);
  const stepUsage =
    terminal.status === CHAT_TURN_OUTCOMES.COMPLETED ? [chatTurnUsage(terminal)] : [];
  return { ...classification, stepUsage };
}

/**
 * The SDK's model-call transform emits a bare `finish` chunk; the native finish
 * reason survives only in the run's terminal outcome. Re-attach it here, at the
 * one edge that holds both the stream and the terminal, so `content-filter` and
 * `length` reach the client as native finish semantics.
 */
export function stampFinishReason(
  stream: ReadableStream<UIMessageChunk>,
  terminal: Promise<
    Readonly<{
      finishReason?: string;
      stepUsage?: readonly TurnUsage[];
      activityDurationMs?: number;
    }>
  >,
): ReadableStream<UIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
        if (chunk.type !== UI_MESSAGE_CHUNK_TYPES.FINISH) {
          controller.enqueue(chunk);
          return;
        }
        const terminalOutcome = await terminal;
        const reason = toFinishReason(terminalOutcome.finishReason);
        const messageMetadata =
          terminalOutcome.stepUsage === undefined
            ? {}
            : {
                messageMetadata: {
                  usage: sumTurnUsage(terminalOutcome.stepUsage),
                  ...(terminalOutcome.activityDurationMs === undefined
                    ? {}
                    : { activityDurationMs: terminalOutcome.activityDurationMs }),
                },
              };
        controller.enqueue(
          reason === undefined
            ? { ...chunk, ...messageMetadata }
            : { ...chunk, finishReason: reason, ...messageMetadata },
        );
      },
    }),
  );
}

function toFinishReason(value: string | undefined): SideChatFinishReason | undefined {
  for (const reason of Object.values(SIDE_CHAT_FINISH_REASONS)) {
    if (reason === value) return reason;
  }
  return undefined;
}
