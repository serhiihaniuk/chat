import { getRun, start, type Run } from "workflow/api";

import { initializeProductionWorkflowServices } from "#composition/workflow/production";
import {
  executeChatTurn,
  toChatTurnUIStream,
  type ChatTurnWorkflowInput,
  type StartedChatTurn,
} from "../chat-turn.js";
import type { ChatTurnTerminalOutcome } from "../outcome/chat-turn-outcome.js";
import type { ChatTurnJournalPart } from "../journal/chat-turn-journal.js";

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
export {
  didWorkflowAgentFail,
  toCompletedChatTurnOutcome,
} from "../outcome/completed-chat-turn-outcome.js";
export {
  clientToolResultHookToken,
  preserveDynamicClientToolIdentity,
  resumeClientToolResult,
} from "../client-tools/index.js";
export { replayChatTurn, type ReplayedChatTurn } from "./stream/chat-turn-replay.js";

/** Route-side facade. Workflow handles and engine result objects remain private. */
export async function startChatTurn(input: ChatTurnWorkflowInput): Promise<StartedChatTurn> {
  const run = await start(chatTurnWorkflow, [input]);
  return toStartedChatTurn(run, input);
}

/** Re-attach an exact HTTP request replay to the durable run already bound in Postgres. */
export function resumeChatTurn(
  runId: string,
  input: ChatTurnWorkflowInput,
): Promise<StartedChatTurn> {
  return Promise.resolve(toStartedChatTurn(getRun<ChatTurnTerminalOutcome>(runId), input));
}

function toStartedChatTurn(
  run: Run<ChatTurnTerminalOutcome>,
  input: ChatTurnWorkflowInput,
): StartedChatTurn {
  return {
    runId: run.runId,
    stream: toChatTurnUIStream(
      run.getReadable<ChatTurnJournalPart>(),
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
