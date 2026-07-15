import type { SidechatRepositories } from "@side-chat/db";

import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";
import type {
  TurnCancellationStore,
  TurnExecutionClaimStore,
  TurnStore,
} from "#application/ports/turn/turn-store";
import type {
  ClientToolDispatchStore,
  ClientToolWorkflowStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";
import type {
  ToolApprovalDecisionStore,
  ToolApprovalWorkflowStore,
} from "#application/ports/turn/tools/tool-approval-store";

/** The route-facing PostgreSQL store surface, including pool disposal. */
export type PostgresTurnState = ConversationStore &
  ConversationQueryStore &
  ConversationTitleStore &
  TurnStore &
  TurnExecutionClaimStore &
  TurnCancellationStore &
  ClientToolDispatchStore &
  ClientToolWorkflowStore &
  ToolApprovalDecisionStore &
  ToolApprovalWorkflowStore &
  TurnRunAccess & { close: () => Promise<void> };

/** Repositories that also own their connection pool, as the pg-drizzle factory returns. */
export type ClosableRepositories = SidechatRepositories & {
  close: () => Promise<void>;
};

export type TurnStateContext = Readonly<{
  repositories: SidechatRepositories;
}>;
