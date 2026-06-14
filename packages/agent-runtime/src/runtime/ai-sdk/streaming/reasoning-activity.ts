import { RUNTIME_EVENT_TYPES, type RuntimeEvent } from "../../contract/runtime-event.js";
import { optionalField } from "@side-chat/shared";
import type { RuntimeProviderRequest } from "../../contract/runtime-request.js";
import {
  RUNTIME_ACTIVITY_KINDS,
  RUNTIME_ACTIVITY_STATUSES,
  type RuntimeActivityStatus,
} from "../../contract/runtime-activity.js";

/**
 * Scratch state for reasoning text that is still streaming.
 *
 * The SDK can send many small chunks. This state lets the UI update one row
 * until the current reasoning block is flushed.
 */
export type ReasoningStreamState = {
  blockIndex: number;
  text: string;
};

/**
 * Start a fresh reasoning accumulator for one model stream.
 */
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
  return createReasoningActivity(request, sequence, state, RUNTIME_ACTIVITY_STATUSES.RUNNING);
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
  const event = createReasoningActivity(
    request,
    sequence,
    state,
    RUNTIME_ACTIVITY_STATUSES.COMPLETED,
  );
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
  status: RuntimeActivityStatus,
): RuntimeEvent | undefined => {
  const presentation = toReasoningPresentation(state.text);
  if (!presentation) return undefined;

  return {
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
    activityId: `reasoning-${request.assistantTurnId}-${state.blockIndex}`,
    activityKind: RUNTIME_ACTIVITY_KINDS.REASONING,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence,
    status,
    title: presentation.title,
    ...optionalField("body", presentation.body || undefined),
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
  if (title) return { title, ...optionalField("body", body || undefined) };

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
