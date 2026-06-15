import type { PreparedHistoryMessage, PreparedRuntimeMessage } from "@side-chat/partner-ai-core";
import type { PrepareTurnContextInput } from "../service-context-manager-types.js";

// Conversation history and the current user message are rendered as runtime
// messages. Host context travels through the prepared context board instead of
// being rendered as chat-turn messages.
export const createRuntimeMessages = (
  input: PrepareTurnContextInput,
  historyMessages: readonly PreparedHistoryMessage[],
): readonly PreparedRuntimeMessage[] => [
  ...historyMessages.map(toRuntimeMessage),
  { role: "user", content: input.request.message.content },
];

const toRuntimeMessage = (message: PreparedHistoryMessage): PreparedRuntimeMessage => ({
  role: message.role,
  content: message.content,
});
