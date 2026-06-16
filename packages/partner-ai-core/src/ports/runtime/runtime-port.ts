import type { AiRuntimePort as RuntimePortContract } from "@side-chat/ai-runtime-contract";

/**
 * The provider-neutral runtime boundary core calls after a turn is prepared.
 *
 * Core decides when to start streaming and how returned events become browser
 * events. The app decides which concrete runtime implementation owns the
 * model/provider work.
 */
export type AiRuntimePort = RuntimePortContract;
