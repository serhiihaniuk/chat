import { type ModelCallStreamPart } from "@ai-sdk/workflow";
import { getRun, start } from "workflow/api";

import { initializeTestingWorkflowServices } from "#composition/workflow/testing";
import {
  executeChatTurn,
  toChatTurnUIStream,
  type ChatTurnWorkflowInput,
  type StartedChatTurn,
} from "#workflows/chat-turn";
import type { ChatTurnTerminalOutcome } from "#workflows/outcome/chat-turn-outcome";

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
      run.getReadable<ModelCallStreamPart>(),
      input.clientTools,
      `${input.turnId}-assistant`,
    ),
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
