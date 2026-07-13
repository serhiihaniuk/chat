import {
  WorkflowAgent,
  type WorkflowAgentOptions,
  type WorkflowAgentStreamResult,
} from "@ai-sdk/workflow";
import { getWorkflowMetadata, getWritable } from "workflow";
import { start } from "workflow/api";

import {
  normalizeConversationTitle,
  type ConversationTitleWorkflowInput,
  type ConversationTitleWorkflowResult,
  type ConversationTitleWorkflowStarter,
} from "#application/conversations/generate-conversation-title";
import { assertDurableModelHandle, type ModelProvider } from "#application/ports/model-provider";
import { PRIVATE_TELEMETRY_OPTIONS } from "#application/ports/telemetry-sink";
import { initializeProductionWorkflowServices } from "#composition/workflow/production";

import { ABORT_ERROR_NAME } from "../../chat-turn-outcome.js";
import { patchWorkflowRealmAbortSignal } from "../../realm/abort-signal-patch.js";
import { createSuspendableTurnTimeout } from "../../timeout/turn-timeout.js";
import { persistConversationTitle } from "./persist-conversation-title.js";
import { recordConversationTitleRun } from "./record-conversation-title-run.js";

const TITLE_INSTRUCTIONS =
  "Create a concise conversation title. Return 2 to 6 words, no punctuation, and do not copy the full user message.";

const TITLE_EXECUTION = {
  FAILED: "Conversation title generation failed",
  TIMEOUT: "Conversation title generation timed out",
} as const;

type TitleStreamOutcome =
  | Readonly<{ kind: "completed"; result: WorkflowAgentStreamResult }>
  | Readonly<{ kind: "failed" }>;

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

  // Link this run to its conversation first, so even a run that produces no title
  // is prunable under legal_hold like a turn-bound run.
  await recordConversationTitleRun({
    auth: input.auth,
    conversationId: input.conversationId,
    runId: getWorkflowMetadata().workflowRunId,
  });

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
  const controller = new AbortController();
  patchWorkflowRealmAbortSignal(controller.signal);
  const resolvedModel = modelProvider.modelFor({
    modelId: input.modelId,
    requestId: input.requestId,
  });
  assertDurableModelHandle(resolvedModel.model);
  const agent = new WorkflowAgent(
    titleAgentOptions(resolvedModel.model, resolvedModel.providerOptions),
  );
  const stream = agent.stream({
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
    abortSignal: controller.signal,
  });
  const result = await titleResultBeforeTimeout(stream, controller, input.timeoutMs);
  const content = result.steps.at(-1)?.content ?? [];
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

async function titleResultBeforeTimeout(
  stream: Promise<WorkflowAgentStreamResult>,
  controller: AbortController,
  timeoutMs: number,
): Promise<WorkflowAgentStreamResult> {
  const settled = stream.then<TitleStreamOutcome, TitleStreamOutcome>(
    (result) => ({ kind: "completed", result }),
    () => ({ kind: "failed" }),
  );
  const timeout = async (): Promise<"timeout"> => {
    await createSuspendableTurnTimeout(timeoutMs).waitUntilElapsed();
    controller.abort(new DOMException(TITLE_EXECUTION.TIMEOUT, ABORT_ERROR_NAME));
    await settled;
    return "timeout";
  };
  const outcome = await Promise.race([settled, timeout()]);
  if (outcome === "timeout") throw new Error(TITLE_EXECUTION.TIMEOUT);
  if (outcome.kind === "failed") throw new Error(TITLE_EXECUTION.FAILED);
  return outcome.result;
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
