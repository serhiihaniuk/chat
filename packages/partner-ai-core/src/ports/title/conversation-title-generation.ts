export type ConversationTitlePromptConfig = {
  readonly systemInstructions: string;
  readonly taskInstructions: string;
  readonly userMessageLabel: string;
  readonly assistantResponseLabel: string;
};

export type ConversationTitleGenerationPort =
  | {
      readonly mode: "disabled";
    }
  | {
      readonly mode: "enabled";
      readonly prompt: ConversationTitlePromptConfig;
    };

export const DISABLED_CONVERSATION_TITLE_GENERATION = {
  mode: "disabled",
} as const satisfies ConversationTitleGenerationPort;
