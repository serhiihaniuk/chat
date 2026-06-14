import { RUNTIME_EVENT_TYPES, type RuntimeEvent } from "../../contract/runtime-event.js";
import type { ActivityKind, ActivityStatus } from "@side-chat/chat-protocol";
import type { RuntimeProviderRequest } from "../../contract/runtime-request.js";

const ACTIVITY_KIND_REASONING = "reasoning" satisfies ActivityKind;
const ACTIVITY_STATUS_RUNNING = "running" satisfies ActivityStatus;
const ACTIVITY_STATUS_COMPLETED = "completed" satisfies ActivityStatus;

export type ReasoningStreamState = {
  blockIndex: number;
  text: string;
};

export const createReasoningStreamState = (): ReasoningStreamState => ({
  blockIndex: 0,
  text: "",
});

/**
 * Accumulate reasoning deltas into the current reasoning activity row.
 *
 * The model may emit many small reasoning chunks. We keep the same activity id
 * while the current reasoning block grows, so the UI updates one row instead of
 * rendering dozens of tiny "thinking" entries.
 */
export const appendReasoningDelta = (
  request: RuntimeProviderRequest,
  state: ReasoningStreamState,
  delta: string,
  sequence: number,
): RuntimeEvent | undefined => {
  state.text = `${state.text}${delta}`;
  return createReasoningActivity(request, sequence, state, ACTIVITY_STATUS_RUNNING);
};

/**
 * Complete the current reasoning activity before other output appears.
 *
 * This keeps reasoning visually before the text/tool event it led to, while
 * still avoiding raw provider reasoning chunks outside the runtime package.
 */
export const flushReasoningActivity = (
  request: RuntimeProviderRequest,
  state: ReasoningStreamState,
  sequence: number,
): RuntimeEvent | undefined => {
  const event = createReasoningActivity(request, sequence, state, ACTIVITY_STATUS_COMPLETED);
  if (event) {
    state.blockIndex += 1;
    state.text = "";
  }
  return event;
};

const createReasoningActivity = (
  request: RuntimeProviderRequest,
  sequence: number,
  state: ReasoningStreamState,
  status: ActivityStatus,
): RuntimeEvent | undefined => {
  const presentation = toReasoningPresentation(state.text);
  if (!presentation) return undefined;

  return {
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
    activityId: `reasoning-${request.assistantTurnId}-${state.blockIndex}`,
    activityKind: ACTIVITY_KIND_REASONING,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence,
    status,
    title: presentation.title,
    ...(presentation.body ? { body: presentation.body } : {}),
  };
};

/**
 * Convert provider reasoning text into a display-safe activity label.
 *
 * The runtime never exposes hidden chain-of-thought. It only keeps a short,
 * sanitized summary title/body suitable for the activity timeline.
 */
const toReasoningPresentation = (
  reasoningText: string,
): { readonly title: string; readonly body?: string } | undefined => {
  const normalized = reasoningText.replace(/\s+/gu, " ").trim();
  if (!normalized) return undefined;

  const titledContent = /^\*\*(?<title>[^*]+)\*\*\s*(?<body>.*)$/su.exec(normalized);
  const title = stripInlineMarkdown(titledContent?.groups?.["title"] ?? "");
  const body = titledContent?.groups?.["body"]?.trim();
  if (title) return { title, ...(body ? { body } : {}) };

  const fallbackTitle = stripInlineMarkdown(normalized).replace(/\*/gu, "").trim();
  return {
    title: fallbackTitle && normalized.length <= 120 ? fallbackTitle : "Thinking",
  };
};

const stripInlineMarkdown = (value: string): string =>
  value
    .replace(/\*\*(?<content>[^*]+)\*\*/gu, "$<content>")
    .replace(/[_`]/gu, "")
    .trim();
