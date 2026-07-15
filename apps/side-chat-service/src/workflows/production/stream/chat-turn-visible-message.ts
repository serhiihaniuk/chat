import { getRun } from "workflow/api";

import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";
import type { ChatTurnJournalPart } from "../../journal/chat-turn-journal.js";
import {
  readChatTurnJournalProjection,
  type ChatTurnJournalProjection,
} from "../../outcome/chat-turn-visible-message.js";

/** Read the closed durable journal before persisting its terminal projection. */
export async function readChatTurnJournalProjectionStep(
  runId: string,
  turnId: string,
  clientTools: readonly ClientToolDefinition[],
): Promise<ChatTurnJournalProjection> {
  "use step";

  return readChatTurnJournalProjection(
    turnId,
    getRun(runId).getReadable<ChatTurnJournalPart>(),
    clientTools,
  );
}
