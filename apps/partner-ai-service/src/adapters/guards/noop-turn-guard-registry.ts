import type { TurnGuardRegistryPort } from "@side-chat/partner-ai-core";

export const createNoopTurnGuardRegistry = (): TurnGuardRegistryPort => ({ guards: [] });
