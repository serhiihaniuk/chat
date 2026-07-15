import type { WorkflowUIMessage } from "#entities/workflow-chat";

/** Read the folded usage total from the newest assistant message, if present. */
export function projectLatestAssistantUsage(
  messages: readonly WorkflowUIMessage[],
): number | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message.metadata?.usage.totalTokens;
  }
  return undefined;
}
