import type {
  AgentRuntimeRequest,
  RuntimeContextBoard,
  RuntimeContextSection,
  RuntimeMessage,
} from "../contract/runtime-request.js";
import type { AssistantProfile } from "./assistant-profile.js";

/**
 * Build the exact message list that the AI SDK adapter will send to the model.
 *
 * The runtime does not choose what context is trustworthy. It receives an
 * already-approved context board and places it after the profile instructions,
 * before the conversation messages, so the model sees stable instructions and
 * trusted context before the user's latest text.
 */
export const renderRuntimeMessages = (
  profile: AssistantProfile,
  request: AgentRuntimeRequest,
): readonly RuntimeMessage[] => [
  profileToSystemMessage(profile),
  ...(request.contextBoard ? [contextBoardToSystemMessage(request.contextBoard)] : []),
  ...request.messages,
];

const profileToSystemMessage = (profile: AssistantProfile): RuntimeMessage => ({
  role: "system",
  content: profile.systemInstructions,
});

const contextBoardToSystemMessage = (contextBoard: RuntimeContextBoard): RuntimeMessage => ({
  role: "system",
  content: `Trusted context board:\n\n${renderContextBoardSections(contextBoard)}`,
});

const renderContextBoardSections = (board: RuntimeContextBoard): string =>
  board.sections
    .toSorted(compareContextSections)
    .map((section) => `### ${section.title}\n${section.content.trim()}`)
    .join("\n\n");

const compareContextSections = (
  left: RuntimeContextSection,
  right: RuntimeContextSection,
): number => (right.priority ?? 0) - (left.priority ?? 0);
