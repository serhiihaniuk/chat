import type { TurnMessage, TurnRef } from "#domain/turn/turn";

export interface MessageStore {
  appendAssistantMessage(turn: TurnRef, message: TurnMessage): Promise<void>;
}
