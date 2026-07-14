/**
 * Provider-neutral reasoning values shared by the authenticated model catalog,
 * chat request validation, and the browser selector. Provider adapters map these
 * plain values to their own SDK options.
 */
export const SIDE_CHAT_REASONING_EFFORTS = {
  NONE: "none",
  MINIMAL: "minimal",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
} as const;

export const SIDE_CHAT_REASONING_EFFORT_VALUES = Object.values(SIDE_CHAT_REASONING_EFFORTS);

export type SideChatReasoningEffort = (typeof SIDE_CHAT_REASONING_EFFORT_VALUES)[number];

export type SideChatReasoningSupport = Readonly<{
  efforts: readonly SideChatReasoningEffort[];
  defaultEffort: SideChatReasoningEffort;
}>;

export function isSideChatReasoningEffort(value: unknown): value is SideChatReasoningEffort {
  return (
    typeof value === "string" &&
    SIDE_CHAT_REASONING_EFFORT_VALUES.some((effort) => effort === value)
  );
}
