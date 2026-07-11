import type { UIMessage } from "ai";

import type { TurnRef } from "#domain/turn/turn";

export interface MessageStore {
  appendAssistantMessage(turn: TurnRef, message: UIMessage): Promise<void>;
}
