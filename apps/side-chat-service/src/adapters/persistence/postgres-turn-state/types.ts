import type { SidechatRepositories } from "@side-chat/db";

import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { MessageStore } from "#application/ports/turn/message-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";
import type { TurnStore } from "#application/ports/turn/turn-store";
import type {
  ClientToolDispatchStore,
  ClientToolWorkflowStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";

/** The route-facing PostgreSQL store surface, including pool disposal. */
export type PostgresTurnState = ConversationStore &
  ConversationQueryStore &
  ConversationTitleStore &
  MessageStore &
  TurnStore &
  ClientToolDispatchStore &
  ClientToolWorkflowStore &
  TurnRunAccess & { close: () => Promise<void> };

/** Repositories that also own their connection pool, as the pg-drizzle factory returns. */
export type ClosableRepositories = SidechatRepositories & {
  close: () => Promise<void>;
};

export type TurnStateContext = Readonly<{
  repositories: SidechatRepositories;
}>;
