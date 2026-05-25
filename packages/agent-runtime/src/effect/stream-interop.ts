import { Stream } from "effect";

import { AgentRuntimeError } from "#runtime/runtime-error";
import type { RuntimeEvent } from "#runtime/runtime-event";

export type RuntimeEventStream = Stream.Stream<RuntimeEvent, AgentRuntimeError>;

export const runtimeStreamFromAsyncIterable = (
  iterable: AsyncIterable<RuntimeEvent>,
): RuntimeEventStream => Stream.fromAsyncIterable(iterable, toAgentRuntimeError);

export const runtimeStreamToAsyncIterable = (
  stream: RuntimeEventStream,
): AsyncIterable<RuntimeEvent> => Stream.toAsyncIterable(stream);

const toAgentRuntimeError = (error: unknown): AgentRuntimeError => {
  if (error instanceof AgentRuntimeError) return error;
  return new AgentRuntimeError(
    "internal_error",
    error instanceof Error ? error.message : "agent runtime stream failed",
  );
};
