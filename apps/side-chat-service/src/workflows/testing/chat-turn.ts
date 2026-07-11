import { createModelCallToUIChunkTransform, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { start } from "workflow/api";

import { initializeTestingWorkflowServices } from "#composition/workflow/testing";
import {
  executeChatTurn,
  type ChatTurnTerminalOutcome,
  type ChatTurnWorkflowInput,
  type StartedChatTurn,
} from "#workflows/production/chat-turn";

/** Compiled test entry uses the same mechanics with the serde scripted model port. */
export async function testingChatTurnWorkflow(
  input: ChatTurnWorkflowInput,
): Promise<ChatTurnTerminalOutcome> {
  "use workflow";

  return executeChatTurn(input, initializeTestingWorkflowServices().modelProvider);
}

export async function startTestingChatTurn(input: ChatTurnWorkflowInput): Promise<StartedChatTurn> {
  const run = await start(testingChatTurnWorkflow, [input]);
  return {
    runId: run.runId,
    stream: run.getReadable<ModelCallStreamPart>().pipeThrough(createModelCallToUIChunkTransform()),
    terminal: run.returnValue,
  };
}
