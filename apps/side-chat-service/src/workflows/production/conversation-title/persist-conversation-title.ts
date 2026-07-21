import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";
import { initializeProductionWorkflowServices } from "#composition/workflow/production";
import {
  createWorkflowStepStore,
  withWorkflowStepStore,
} from "#composition/workflow/workflow-step-store";

type TitleWriteInput = Readonly<{
  auth: Parameters<ConversationTitleStore["prepareConversationTitle"]>[0];
  conversationId: string;
  title: string;
}>;

/** Persist one generated title inside the durable workflow's Node activity boundary. */
export async function persistConversationTitle(input: TitleWriteInput): Promise<void> {
  "use step";

  const databaseUrl = initializeProductionWorkflowServices().databaseUrl;
  if (databaseUrl === undefined) {
    throw new Error("Durable title persistence requires configured PostgreSQL storage");
  }

  await withWorkflowStepStore(databaseUrl, createWorkflowStepStore, (store) =>
    store.prepareConversationTitle(input.auth, input.conversationId, input.title),
  );
}
