import { createModelCallToUIChunkTransform, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { getRun, start } from "workflow/api";

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

/** Testing-only measurement of the journal shape produced by WorkflowAgent. */
export async function inspectTestingChatTurnJournal(runId: string) {
  const readable = getRun<ChatTurnTerminalOutcome>(runId).getReadable<ModelCallStreamPart>();
  const dataRows = (await readable.getTailIndex()) + 1;
  const totalRows = dataRows + 1; // Workflow's EOF marker is stored as its own row.
  return { dataRows, totalRows, postgresSqlRoundTrips: totalRows * 2 };
}
