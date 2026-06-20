import type { ConversationTitlePromptConfig } from "@side-chat/partner-ai-core";

/**
 * Auxiliary model jobs implemented by the service outside the main chat turn.
 *
 * Each descriptor names an actual app-supported job and its closed modes. The
 * prompt is safe product behavior, not a secret; provider credentials and model
 * transport stay in normal runtime config.
 */

type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

export const AUXILIARY_JOB_IDS = {
  CONVERSATION_TITLE: "conversation_title",
} as const;

export type AuxiliaryJobId = ObjectValue<typeof AUXILIARY_JOB_IDS>;

export const AUXILIARY_JOB_MODES = {
  ENABLED: "enabled",
  DISABLED: "disabled",
} as const;

export type AuxiliaryJobMode = ObjectValue<typeof AUXILIARY_JOB_MODES>;

const CONVERSATION_TITLE_PROMPT = {
  systemInstructions: [
    "Generate a concise, safe title for the completed Side Chat exchange.",
    "Return only the title.",
    "Use 2 to 6 words, no quotes, no markdown, and no trailing punctuation.",
    "Do not copy the user message verbatim.",
  ].join(" "),
  taskInstructions: "Prepare a short conversation title for this completed exchange.",
  userMessageLabel: "User message",
  assistantResponseLabel: "Assistant response",
} as const satisfies ConversationTitlePromptConfig;

export const AUXILIARY_JOBS = {
  CONVERSATION_TITLE: {
    JOB_ID: AUXILIARY_JOB_IDS.CONVERSATION_TITLE,
    LABEL: "Conversation title",
    MODES: AUXILIARY_JOB_MODES,
    PROMPT_SECTIONS: {
      SYSTEM_INSTRUCTIONS: "system_instructions",
      TASK_INSTRUCTIONS: "task_instructions",
      USER_MESSAGE_LABEL: "user_message_label",
      ASSISTANT_RESPONSE_LABEL: "assistant_response_label",
    },
    DEFAULT_PROMPT: CONVERSATION_TITLE_PROMPT,
  },
} as const;
