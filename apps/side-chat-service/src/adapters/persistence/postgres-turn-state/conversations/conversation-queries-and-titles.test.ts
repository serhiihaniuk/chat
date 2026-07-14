import type {
  ListActiveAssistantTurnsCommand,
  PrepareConversationTitleCommand,
  ReadConversationHistoryCommand,
} from "@side-chat/db";
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

    await expect(state.readHistory(AUTH, "conversation_1")).resolves.toEqual({
      messages: [
        {
          id: "message_history",
          role: "user",
          parts: [{ type: "text", text: "history" }],
          metadata: { source: "stored" },
        },
      ],
      hasMoreBefore: false,
    });
    await expect(state.findActiveTurn(AUTH, "conversation_1")).resolves.toEqual({
      turnId: "turn_running",
      runId: "run_running",
      status: "running",
    });
  });

  it("pages history backward with a probe row and exposes the next cursor", async () => {
    const commands: ReadConversationHistoryCommand[] = [];
    const all = [
      { ...messageRecord(), messageId: "m0", sequenceIndex: 0 },
      { ...messageRecord(), messageId: "m1", sequenceIndex: 1 },
      { ...messageRecord(), messageId: "m2", sequenceIndex: 2 },
    ];
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        readConversationHistory: (command) => {
          commands.push(command);
          // Mirror the repository contract: the newest `limit` rows below the
          // floor, returned ascending.
          const below = all.filter(
            (record) =>
              command.beforeSequenceIndex === undefined ||
              record.sequenceIndex < command.beforeSequenceIndex,
          );
          return Promise.resolve(below.slice(-command.limit));
        },
      }),
    );

    const first = await state.readHistory(AUTH, "conversation_1", { limit: 2 });
    // The adapter probes one extra row to detect older history without a count.
    expect(commands[0]?.limit).toBe(3);
    expect(first.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(first).toMatchObject({ hasMoreBefore: true, nextBeforeSequenceIndex: 1 });

    const second = await state.readHistory(AUTH, "conversation_1", {
      limit: 2,
      beforeSequenceIndex: first.nextBeforeSequenceIndex,
    });
    expect(commands[1]).toMatchObject({ limit: 3, beforeSequenceIndex: 1 });
    expect(second.messages.map((message) => message.id)).toEqual(["m0"]);
    expect(second.hasMoreBefore).toBe(false);
    expect(second.nextBeforeSequenceIndex).toBeUndefined();
  });

  it("does not discover a running turn until its durable run id is bound", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        findActiveAssistantTurn: () => Promise.resolve(assistantTurnRecord("turn_unbound")),
      }),
    );

    await expect(state.findActiveTurn(AUTH, "conversation_1")).resolves.toBeUndefined();
  });

  it("maps one scoped active-turn query without per-conversation reads", async () => {
    let command: ListActiveAssistantTurnsCommand | undefined;
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        listActiveAssistantTurns: (input) => {
          command = input;
          return Promise.resolve([
            { ...assistantTurnRecord("turn_running"), runId: "run_running" },
          ]);
        },
      }),
    );

    await expect(state.listActiveTurns(AUTH)).resolves.toEqual([
      {
        conversationId: "conversation_1",
        turnId: "turn_running",
        runId: "run_running",
        status: "running",
      },
    ]);
    expect(command).toEqual({ workspaceId: AUTH.workspaceId, subjectId: AUTH.subjectId });
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
    await state.prepareConversationTitle(AUTH, "conversation_1", "Prepared conversation title");

    expect(titleCommand).toMatchObject({
      workspaceId: AUTH.workspaceId,
      subjectId: AUTH.subjectId,
      conversationId: "conversation_1",
      titleText: "Prepared conversation title",
    });
  });
});
