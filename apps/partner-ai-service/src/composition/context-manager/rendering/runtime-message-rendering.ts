import type { PreparedRuntimeMessage } from "@side-chat/partner-ai-core";
import type { PrepareTurnContextInput } from "../service-context-manager-types.js";

export const createRuntimeMessages = (
  input: PrepareTurnContextInput,
): readonly PreparedRuntimeMessage[] => [{ role: "user", content: input.request.message.content }];
