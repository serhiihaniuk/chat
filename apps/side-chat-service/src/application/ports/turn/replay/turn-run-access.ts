import type { AuthContext } from "@side-chat/side-chat-server";

export type AccessibleTurnRun = Readonly<{ turnId: string }>;

/** Tenant-scoped run lookup for routes that intentionally carry no conversation id. */
export interface TurnRunAccess {
  assertAccessible(auth: AuthContext, runId: string): Promise<AccessibleTurnRun>;
}
