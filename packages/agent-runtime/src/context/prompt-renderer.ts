import type { AssistantProfile } from "#profiles/assistant-profile";
import { profileToSystemMessage } from "#profiles/prompt-profile";
import type { RuntimeMessage } from "#runtime/runtime-request";
import type { RuntimeContextBoard } from "./context-board.js";
import { renderContextBoardSections } from "./prompt-sections.js";

export type PromptRenderer = {
  render(input: PromptRendererInput): readonly RuntimeMessage[];
};

export type PromptRendererInput = {
  readonly profile: AssistantProfile;
  readonly messages: readonly RuntimeMessage[];
  readonly contextBoard?: RuntimeContextBoard;
};

export const createPromptRenderer = (): PromptRenderer => ({
  render({ contextBoard, messages, profile }) {
    return [
      profileToSystemMessage(profile),
      ...(contextBoard ? [contextBoardToSystemMessage(contextBoard)] : []),
      ...messages,
    ];
  },
});

const contextBoardToSystemMessage = (contextBoard: RuntimeContextBoard): RuntimeMessage => ({
  role: "system",
  content: `Trusted context board:\n\n${renderContextBoardSections(contextBoard)}`,
});
