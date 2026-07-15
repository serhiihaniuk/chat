import type { ModelCallStreamPart } from "@ai-sdk/workflow";
import { start } from "workflow/api";

import { initializeProductionWorkflowServices } from "#composition/workflow/production";
import {
  chatTurnCancellationHookToken,
  executeChatTurn,
  stampAssistantMessageId,
  toChatTurnUIStream,
  type ChatTurnWorkflowInput,
  type StartedChatTurn,
} from "../chat-turn.js";
import type { ChatTurnTerminalOutcome } from "../outcome/chat-turn-outcome.js";

export {
  chatTurnCancellationHookToken,
  executeChatTurn,
  stampAssistantMessageId,
  toChatTurnUIStream,
  type ChatTurnWorkflowInput,
  type SerializableChatMessage,
  type StartedChatTurn,
} from "../chat-turn.js";
export {
  CHAT_TURN_ERROR_CODES,
  CHAT_TURN_OUTCOMES,
  chatTurnUsage,
  classifyChatTurnOutcome,
  toPublicTurnErrorCode,
  type ChatTurnTerminalOutcome,
} from "../outcome/chat-turn-outcome.js";
export { toCompletedChatTurnOutcome } from "../outcome/completed-chat-turn-outcome.js";
export {
  clientToolResultHookToken,
  preserveDynamicClientToolIdentity,
  resumeClientToolResult,
} from "../client-tools/index.js";
export { replayChatTurn, type ReplayedChatTurn } from "./stream/chat-turn-replay.js";

/** Route-side facade. Workflow handles and engine result objects remain private. */
export async function startChatTurn(input: ChatTurnWorkflowInput): Promise<StartedChatTurn> {
  const run = await start(chatTurnWorkflow, [input]);
  return {
    runId: run.runId,
    stream: toChatTurnUIStream(
      run.getReadable<ModelCallStreamPart>(),
      input.clientTools,
      `${input.turnId}-assistant`,
    ),
    terminal: run.returnValue,
  };
}

/** Production entry initializes only production dependencies around neutral mechanics. */
export async function chatTurnWorkflow(
  input: ChatTurnWorkflowInput,
): Promise<ChatTurnTerminalOutcome> {
  "use workflow";

  const services = initializeProductionWorkflowServices();
  return executeChatTurn(input, services.modelProvider, services.serverTools, services.databaseUrl);
}
