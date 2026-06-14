import type { PreparedRuntimeMessage } from "@side-chat/partner-ai-core";
import type { PrepareTurnContextInput } from "../service-context-manager-types.js";

// Only the user's current message is rendered as a runtime message. Memory,
// RAG, research, and host context travel through the prepared context board.
export const createRuntimeMessages = (
  input: PrepareTurnContextInput,
): readonly PreparedRuntimeMessage[] => [{ role: "user", content: input.request.message.content }];
