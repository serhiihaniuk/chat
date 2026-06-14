import type { TurnGuardRegistryPort } from "@side-chat/partner-ai-core";

// Local/test fallback used when no guard registry is injected. Real deployments
// should provide the guards that must run before model, tools, or private context.
export const createNoopTurnGuardRegistry = (): TurnGuardRegistryPort => ({ guards: [] });
