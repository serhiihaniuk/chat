import { WorkflowAgent, type WorkflowAgentOptions } from "@ai-sdk/workflow";
import { Output } from "ai";
import { getWritable } from "workflow";
import { start } from "workflow/api";

import {
  CONVERSATION_TITLE_OUTPUT_SCHEMA,
  normalizeConversationTitle,
  type ConversationTitleWorkflowInput,
  type ConversationTitleWorkflowResult,
  type ConversationTitleWorkflowStarter,
} from "#application/conversations/generate-conversation-title";
import { assertModelInstance, type ModelProvider } from "#application/ports/model-provider";
import { PRIVATE_TELEMETRY_OPTIONS } from "#application/ports/telemetry-sink";
import { initializeProductionWorkflowServices } from "#composition/workflow/production";

import { persistConversationTitle } from "./persist-conversation-title.js";

const TITLE_INSTRUCTIONS =
  "Create a concise conversation title. Return 2 to 6 words, no punctuation, and do not copy the full user message.";

export const productionConversationTitleWorkflowStarter: ConversationTitleWorkflowStarter = {
  start: startGenerateConversationTitle,
};

/** Route-side facade; workflow engine handles remain private to this module. */
export async function startGenerateConversationTitle(input: ConversationTitleWorkflowInput) {
  const run = await start(generateConversationTitleWorkflow, [input]);
  return { runId: run.runId, result: run.returnValue };
}

export async function generateConversationTitleWorkflow(
  input: ConversationTitleWorkflowInput,
): Promise<ConversationTitleWorkflowResult> {
  "use workflow";

  const rawTitle = await executeConversationTitleWorkflow(
    input,
    initializeProductionWorkflowServices().modelProvider,
  );
  return finalizeGeneratedConversationTitle(input, rawTitle);
}

export async function finalizeGeneratedConversationTitle(
  input: ConversationTitleWorkflowInput,
  rawTitle: string,
  persist: typeof persistConversationTitle = persistConversationTitle,
): Promise<ConversationTitleWorkflowResult> {
  const title = normalizeConversationTitle(rawTitle, input.userContent);
  if (title === undefined) return { persisted: false };
  if (!input.persistInWorkflow) return { title, persisted: false };

  await persist({
    auth: input.auth,
    conversationId: input.conversationId,
    title,
  });
  return { title, persisted: true };
}

export async function executeConversationTitleWorkflow(
  input: ConversationTitleWorkflowInput,
  modelProvider: ModelProvider,
): Promise<string> {
  const resolvedModel = modelProvider.modelFor({
    modelId: input.modelId,
    requestId: input.requestId,
  });
  assertModelInstance(resolvedModel.model);
  const agent = new WorkflowAgent(
    titleAgentOptions(resolvedModel.model, resolvedModel.providerOptions),
  );
  const result = await agent.stream({
    messages: [
      {
        role: "user",
        content: [
          "User message:",
          input.userContent,
          "",
          "Assistant response:",
          input.assistantContent,
        ].join("\n"),
      },
    ],
    writable: getWritable(),
    timeout: input.timeoutMs,
    output: Output.object({ schema: CONVERSATION_TITLE_OUTPUT_SCHEMA }),
  });
  return result.output.title;
}

function titleAgentOptions(
  model: WorkflowAgentOptions["model"],
  providerOptions: WorkflowAgentOptions["providerOptions"],
): WorkflowAgentOptions {
  return {
    id: "side-chat-conversation-title",
    model,
    instructions: TITLE_INSTRUCTIONS,
    maxRetries: 0,
    telemetry: PRIVATE_TELEMETRY_OPTIONS,
    ...(providerOptions === undefined ? {} : { providerOptions }),
  };
}
