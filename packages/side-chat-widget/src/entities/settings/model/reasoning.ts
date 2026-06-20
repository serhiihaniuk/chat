// How much of the assistant's reasoning the widget exposes by default. This is a
// host/server-configured option (not a user-facing UI toggle): live thinking opens
// while a turn streams only after the stream emits an activity trace; after
// completion, "minimal" collapses to the summary and "detailed" keeps the
// reasoning timeline expanded.

export const REASONING_VISIBILITY_LEVELS = ["minimal", "detailed"] as const;

export type ReasoningVisibility = (typeof REASONING_VISIBILITY_LEVELS)[number];

export const DEFAULT_REASONING_VISIBILITY: ReasoningVisibility = "minimal";
