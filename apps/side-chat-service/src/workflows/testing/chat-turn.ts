import { start } from "workflow/api";

import { initializeTestingWorkflowServices } from "#composition/workflow/testing";
import {
  executeChatTurn,
  toChatTurnUIStream,
  type ChatTurnWorkflowInput,
  type StartedChatTurn,
} from "#workflows/chat-turn";
import type { ChatTurnTerminalOutcome } from "#workflows/outcome/chat-turn-outcome";
import type { ChatTurnJournalPart } from "#workflows/journal/chat-turn-journal";

/** Compiled test entry uses the same mechanics with the serde scripted model port. */
export async function testingChatTurnWorkflow(
  input: ChatTurnWorkflowInput,
): Promise<ChatTurnTerminalOutcome> {
  "use workflow";

  const services = initializeTestingWorkflowServices();
  return executeChatTurn(input, services.modelProvider, services.serverTools, services.databaseUrl);
}

export async function startTestingChatTurn(input: ChatTurnWorkflowInput): Promise<StartedChatTurn> {
  const run = await start(testingChatTurnWorkflow, [input]);
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
