// How much of the assistant's reasoning the widget exposes by default. This is a
// host/server-configured option (not a user-facing UI toggle): "minimal" keeps the
// reasoning timeline collapsed (just the "Thought for Ns" summary); "detailed"
// expands it while the turn streams.

export const REASONING_VISIBILITY_LEVELS = ["minimal", "detailed"] as const;

export type ReasoningVisibility = (typeof REASONING_VISIBILITY_LEVELS)[number];

export const DEFAULT_REASONING_VISIBILITY: ReasoningVisibility = "minimal";
