import type { RuntimeMessage } from "#runtime/runtime-request";
import type { AssistantProfile } from "./assistant-profile.js";

export const profileToSystemMessage = (profile: AssistantProfile): RuntimeMessage => ({
  role: "system",
  content: profile.systemInstructions,
});
