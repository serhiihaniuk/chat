import type { Stream } from "effect";

import type { AgentRuntimeError } from "./runtime-error.js";
import type { RuntimeEvent } from "./runtime-event.js";

export type RuntimeEventStream = Stream.Stream<RuntimeEvent, AgentRuntimeError>;
