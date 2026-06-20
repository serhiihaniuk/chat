import type { ConversationTitleGenerationPort } from "@side-chat/partner-ai-core";
import { AUXILIARY_JOBS } from "../catalog/capabilities/auxiliary-jobs.js";

export const DEFAULT_SERVICE_CONVERSATION_TITLE_GENERATION = {
  mode: AUXILIARY_JOBS.CONVERSATION_TITLE.MODES.ENABLED,
  prompt: AUXILIARY_JOBS.CONVERSATION_TITLE.DEFAULT_PROMPT,
} as const satisfies ConversationTitleGenerationPort;
