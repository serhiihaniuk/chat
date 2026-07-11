import type { PrepareConversationTitleCommand } from "@side-chat/db";
import { describe, expect, it } from "vitest";

import {
  AUTH,
  USER_MESSAGE,
  assistantTurnRecord,
  conversationRecord,
  fakeRepositories,
  messageRecord,
} from "#testing/persistence/postgres-turn-state-test-support";

import { createTurnStateFromRepositories } from "../../postgres-turn-state.js";

describe("postgres turn state query and title mapping", () => {
  it("maps persisted history and a bound active turn onto the read port", async () => {
    const active = {
      ...assistantTurnRecord("turn_running"),
      runId: "run_running",
    };
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        readConversationHistory: () =>
          Promise.resolve([
            {
              ...messageRecord(),
              messageId: "message_history",
              parts: [{ type: "text", text: "history" }],
              metadataJson: { source: "stored" },
            },
          ]),
        findActiveAssistantTurn: () => Promise.resolve(active),
      }),
    );

    await expect(state.readHistory(AUTH, "conversation_1")).resolves.toEqual([
      {
        id: "message_history",
        role: "user",
        parts: [{ type: "text", text: "history" }],
        metadata: { source: "stored" },
      },
    ]);
    await expect(state.findActiveTurn(AUTH, "conversation_1")).resolves.toEqual(
      {
        turnId: "turn_running",
        runId: "run_running",
        status: "running",
      },
    );
  });

  it("does not discover a running turn until its durable run id is bound", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        findActiveAssistantTurn: () =>
          Promise.resolve(assistantTurnRecord("turn_unbound")),
      }),
    );

    await expect(
      state.findActiveTurn(AUTH, "conversation_1"),
    ).resolves.toBeUndefined();
  });

  it("checks title eligibility and delegates the conditional title write", async () => {
    let titleCommand: PrepareConversationTitleCommand | undefined;
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        findConversation: () => Promise.resolve(conversationRecord()),
        readConversationHistory: () =>
          Promise.resolve([{ ...messageRecord(), messageId: USER_MESSAGE.id }]),
        prepareConversationTitle: (command) => {
          titleCommand = command;
          return Promise.resolve({
            ...conversationRecord(),
            titleText: command.titleText,
          });
        },
      }),
    );

    await expect(
      state.readTitleEligibility(AUTH, "conversation_1", USER_MESSAGE.id),
    ).resolves.toEqual({ eligible: true });
    await state.prepareConversationTitle(
      AUTH,
      "conversation_1",
      "Prepared conversation title",
    );

    expect(titleCommand).toMatchObject({
      workspaceId: AUTH.workspaceId,
      subjectId: AUTH.subjectId,
      conversationId: "conversation_1",
      titleText: "Prepared conversation title",
    });
  });
});
