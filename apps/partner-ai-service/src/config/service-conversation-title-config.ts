import type { ConversationTitleGenerationPort } from "@side-chat/partner-ai-core";

export const DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION = {
  mode: "enabled",
  prompt: {
    systemInstructions: [
      "Generate a concise, safe title for the completed Side Chat exchange.",
      "Return only the title.",
      "Use 2 to 6 words, no quotes, no markdown, and no trailing punctuation.",
      "Do not copy the user message verbatim.",
    ].join(" "),
    taskInstructions: "Prepare a short conversation title for this completed exchange.",
    userMessageLabel: "User message",
    assistantResponseLabel: "Assistant response",
  },
} as const satisfies ConversationTitleGenerationPort;
