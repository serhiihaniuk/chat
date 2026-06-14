import type { Stream } from "effect";

import type { AgentRuntimeError } from "./runtime-error.js";
import type { RuntimeEvent } from "./runtime-event.js";

/**
 * Stream of runtime events produced by an executor.
 *
 * Failures use AgentRuntimeError; thrown SDK/tool values should be converted
 * before they reach callers.
 */
export type RuntimeEventStream = Stream.Stream<RuntimeEvent, AgentRuntimeError>;
