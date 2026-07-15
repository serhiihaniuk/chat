import type { ModelCallStreamPart } from "@ai-sdk/workflow";
import type { UIMessage } from "ai";
import { getRun } from "workflow/api";

import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import { readVisibleAssistantMessage } from "../../outcome/chat-turn-visible-message.js";

/** Read the closed durable journal before persisting the terminal message projection. */
export async function readVisibleAssistantMessageStep(
  runId: string,
  turnId: string,
  clientTools: readonly ClientToolDefinition[],
): Promise<UIMessage | undefined> {
  "use step";

  return readVisibleAssistantMessage(
    turnId,
    getRun(runId).getReadable<ModelCallStreamPart>(),
    clientTools,
  );
}
