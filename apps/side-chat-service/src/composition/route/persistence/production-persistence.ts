import {
  InMemoryTurnState,
  type SeedConversation,
} from "#adapters/persistence/in-memory-turn-state";
import {
  createPostgresTurnState,
  type PostgresTurnState,
} from "#adapters/persistence/postgres-turn-state";
import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { TurnActivityNotificationSource } from "#application/ports/turn/activity/turn-activity-source";
import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import {
  CLIENT_TOOL_DISPATCH_LOOKUP,
  type ClientToolDispatchStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import {
  TOOL_APPROVAL_LOOKUP,
  type ToolApprovalDecisionStore,
} from "#application/ports/turn/tools/tool-approval-store";
import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";
import type {
  TurnCancellationStore,
  TurnExecutionClaimStore,
  TurnStore,
} from "#application/ports/turn/turn-store";
import { AUTH_PROFILES } from "#config/declaration/side-chat-config";
import type { Settings } from "#config/settings/resolve-settings";
import { createPostgresTurnActivityNotificationSource } from "@side-chat/db";

import type { StartServicePart } from "../../lifecycle/resource-scope.js";
import { localChatConversation } from "../testing-harness/local-chat-fixture.js";

export type ProductionPersistence = Readonly<{
  store: ConversationStore &
    ConversationQueryStore &
    ConversationTitleStore &
    TurnStore &
    TurnExecutionClaimStore &
    TurnCancellationStore &
    ClientToolDispatchStore &
    ToolApprovalDecisionStore &
    TurnRunAccess;
  registerClose: StartServicePart;
  activityNotificationSource: TurnActivityNotificationSource;
  /** True when the workflow finalize step owns terminal persistence (Postgres). */
  durable: boolean;
}>;

/** Selects and owns the turn store configured for production composition. */
export function createProductionPersistence(settings: Settings): ProductionPersistence {
  const databaseUrl = settings.persistence.databaseUrl;
  if (databaseUrl === undefined) return createInMemoryPersistence(settings);

  const store: PostgresTurnState = createPostgresTurnState(databaseUrl);
  return {
    store,
    activityNotificationSource: createPostgresTurnActivityNotificationSource(databaseUrl),
    durable: true,
    registerClose: () => ({
      name: "postgres turn state",
      close: () => store.close(),
    }),
  };
}

function createInMemoryPersistence(settings: Settings): ProductionPersistence {
  if (settings.auth.profile === AUTH_PROFILES.PRODUCTION) {
    throw new Error("Production requires persistent Side Chat storage.");
  }
  const store = Object.assign(
    new InMemoryTurnState(productionConversations(settings)),
    unavailableClientToolDispatchStore,
    unavailableToolApprovalStore,
  );
  return {
    store,
    activityNotificationSource: store.turnActivityNotifications,
    durable: false,
    registerClose: () => ({
      name: "in-memory turn state",
      close: () => undefined,
    }),
  };
}

const unavailableClientToolDispatchStore: ClientToolDispatchStore = {
  findOwned: () => Promise.resolve(CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND),
  submit: () => Promise.reject(new Error("Client-tool dispatch persistence is unavailable")),
};

const unavailableToolApprovalStore: ToolApprovalDecisionStore = {
  findOwnedApproval: () => Promise.resolve(TOOL_APPROVAL_LOOKUP.NOT_FOUND),
  decideApproval: () => Promise.reject(new Error("Tool-approval persistence is unavailable")),
};

function productionConversations(settings: Settings): readonly SeedConversation[] {
  if (settings.auth.profile !== AUTH_PROFILES.DEVELOPMENT) return [];
  return [localChatConversation(settings.auth.workspaceId)];
}
