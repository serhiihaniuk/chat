import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import {
  createPostgresTurnState,
  type PostgresTurnState,
} from "#adapters/persistence/postgres-turn-state";
import type { TurnActivityNotificationSource } from "#application/ports/turn/activity/turn-activity-source";
import {
  CLIENT_TOOL_DISPATCH_LOOKUP,
  type ClientToolDispatchStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import {
  TOOL_APPROVAL_LOOKUP,
  type ToolApprovalDecisionStore,
} from "#application/ports/turn/tools/tool-approval-store";
import type { Settings } from "#config/settings/resolve-settings";
import { createPostgresTurnActivityNotificationSource } from "@side-chat/db";

import type { StartServicePart } from "../../lifecycle/resource-scope.js";
import { localChatConversation } from "../testing-harness/local-chat-fixture.js";

export type TestingPersistence<TStore extends InMemoryTurnState | PostgresTurnState> = Readonly<{
  store: TStore;
  clientToolDispatches: ClientToolDispatchStore;
  toolApprovals: ToolApprovalDecisionStore;
  registerClose: StartServicePart;
  activityNotificationSource: TurnActivityNotificationSource;
  /** True when the workflow finalize step owns terminal persistence (Postgres). */
  durable: boolean;
}>;

export function createConfiguredTestingPersistence(
  settings: Settings,
): TestingPersistence<InMemoryTurnState | PostgresTurnState> {
  const databaseUrl = settings.persistence.databaseUrl;
  if (databaseUrl === undefined) {
    return createInMemoryTestingPersistence(
      new InMemoryTurnState([localChatConversation(settings.auth.workspaceId)]),
    );
  }
  const store = createPostgresTurnState(databaseUrl);
  return {
    store,
    activityNotificationSource: createPostgresTurnActivityNotificationSource(databaseUrl),
    clientToolDispatches: store,
    toolApprovals: store,
    durable: true,
    registerClose: () => ({
      name: "postgres testing turn state",
      close: () => store.close(),
    }),
  };
}

export function createInMemoryTestingPersistence(
  store: InMemoryTurnState,
): TestingPersistence<InMemoryTurnState> {
  return {
    store,
    activityNotificationSource: store.turnActivityNotifications,
    clientToolDispatches: unavailableClientToolDispatches,
    toolApprovals: unavailableToolApprovals,
    durable: false,
    registerClose: () => ({
      name: "in-memory testing turn state",
      close: () => undefined,
    }),
  };
}

const unavailableClientToolDispatches: ClientToolDispatchStore = {
  findOwned: () => Promise.resolve(CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND),
  submit: () => Promise.reject(new Error("Client-tool dispatch persistence is unavailable")),
};

const unavailableToolApprovals: ToolApprovalDecisionStore = {
  findOwnedApproval: () => Promise.resolve(TOOL_APPROVAL_LOOKUP.NOT_FOUND),
  decideApproval: () => Promise.reject(new Error("Tool-approval persistence is unavailable")),
};
