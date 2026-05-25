import type { AssistantProfile } from "#profiles/assistant-profile";
import type { RuntimeMessage } from "#runtime/runtime-request";
import type { RuntimeContextBoard, RuntimeContextSection } from "./context-board.js";

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

const profileToSystemMessage = (profile: AssistantProfile): RuntimeMessage => ({
  role: "system",
  content: profile.systemInstructions,
});

const renderContextBoardSections = (board: RuntimeContextBoard): string =>
  board.sections
    .toSorted(compareSections)
    .map((section) => `### ${section.title}\n${section.content.trim()}`)
    .join("\n\n");

const compareSections = (left: RuntimeContextSection, right: RuntimeContextSection): number =>
  (right.priority ?? 0) - (left.priority ?? 0);
