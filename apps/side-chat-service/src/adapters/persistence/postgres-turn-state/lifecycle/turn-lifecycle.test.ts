import {
  DbRepositoryError,
  type AppendMessageCommand,
  type FinalizeAssistantTurnCommand,
  type CreateOrGetConversationCommand,
  type StartAssistantTurnCommand,
} from "@side-chat/db";
import { describe, expect, it } from "vitest";

import { TURN_REJECTION_CODES } from "#application/turn/turn-errors";
import { TURN_CLAIM_DISPOSITIONS } from "#application/ports/turn/turn-store";
import { TURN_MESSAGE_ROLES, TURN_TERMINAL_STATUSES } from "#domain/turn/turn";

import {
  AUTH,
  BEGIN_INPUT,
  NOW,
  assistantTurnRecord,
  conversationRecord,
  fakeRepositories,
  messageRecord,
  ok,
  uniqueViolation,
} from "#testing/persistence/postgres-turn-state-test-support";

import { createTurnStateFromRepositories } from "../../postgres-turn-state.js";

describe("postgres turn state adapter mapping", () => {
  it("maps a TurnMessage to a text part and threads pass-through identity on begin", async () => {
    let appendCommand: AppendMessageCommand | undefined;
    let startCommand: StartAssistantTurnCommand | undefined;
    let conversationCreated: CreateOrGetConversationCommand | undefined;
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        createOrGetConversation: (command) => {
          conversationCreated = command;
          return ok(conversationRecord());
        },
        appendMessage: (command) => {
          appendCommand = command;
          return ok(messageRecord());
        },
        startAssistantTurn: (command) => {
          startCommand = command;
          return ok(assistantTurnRecord("turn_9"));
        },
      }),
    );

    const turn = await state.beginTurn(BEGIN_INPUT);

    expect(turn).toEqual({
      conversationId: "conversation_1",
      turnId: "turn_9",
      workspaceId: AUTH.workspaceId,
      subjectId: AUTH.subjectId,
    });
    // conversationId is passed through as both id and key; actor is the subject.
    expect(conversationCreated).toMatchObject({
      conversationId: "conversation_1",
      conversationKey: "conversation_1",
      actorId: AUTH.subjectId,
    });
    // The user TurnMessage becomes a single durable text part.
    expect(appendCommand).toMatchObject({
      conversationId: "conversation_1",
      messageId: "user_1",
      subjectId: "subject_1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
      metadataJson: {},
    });
    // Provenance is placeholder (no model info on BeginTurnInput yet).
    expect(startCommand).toMatchObject({
      requestId: "request_1",
      userMessageId: "user_1",
      actorId: AUTH.subjectId,
      modelProvider: "pending",
      modelId: "pending",
    });
  });

  it("maps the db busy guard to a BUSY rejection", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        createOrGetConversation: () => ok(conversationRecord()),
        appendMessage: () => ok(messageRecord()),
        startAssistantTurn: () =>
          Promise.reject(new DbRepositoryError("conversation_busy", "busy")),
      }),
    );

    await expect(state.beginTurn(BEGIN_INPUT)).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.BUSY,
    });
  });

  it("maps a conversations_pkey collision to a FORBIDDEN rejection", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        createOrGetConversation: () => Promise.reject(uniqueViolation("conversations_pkey")),
      }),
    );

    await expect(state.beginTurn(BEGIN_INPUT)).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.FORBIDDEN,
    });
  });

  it("rethrows a non-pkey unique violation from conversation create", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        createOrGetConversation: () => Promise.reject(uniqueViolation("some_other_constraint")),
      }),
    );

    await expect(state.beginTurn(BEGIN_INPUT)).rejects.toMatchObject({
      message: expect.stringContaining("unique constraint"),
    });
  });

  it("maps a missing conversation to NOT_FOUND on assertOwned", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({ findConversation: () => Promise.resolve(undefined) }),
    );

    await expect(state.assertOwned(AUTH, "conversation_1")).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.NOT_FOUND,
    });
  });

  it("passes assertOwned when the conversation resolves", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        findConversation: () => Promise.resolve(conversationRecord()),
      }),
    );

    await expect(state.assertOwned(AUTH, "conversation_1")).resolves.toBeUndefined();
  });

  it("maps an unavailable resolved slot to BUSY on the assertCanBegin pre-check", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        resolveConversationTurnAvailability: () => Promise.resolve(false),
      }),
    );

    await expect(state.assertCanBegin(AUTH, "conversation_1")).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.BUSY,
    });
  });

  it("allows assertCanBegin when recovery resolves the slot as available", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        resolveConversationTurnAvailability: () => Promise.resolve(true),
      }),
    );

    await expect(state.assertCanBegin(AUTH, "conversation_1")).resolves.toBeUndefined();
  });

  it("maps the Workflow claim to execute, cancel, or fenced", async () => {
    const turn = {
      workspaceId: AUTH.workspaceId,
      subjectId: AUTH.subjectId,
      conversationId: "conversation_1",
      turnId: "turn_claim",
    } as const;
    const execute = createTurnStateFromRepositories(
      fakeRepositories({
        claimTurnRun: () =>
          Promise.resolve({ record: assistantTurnRecord("turn_claim"), claimed: true }),
      }),
    );
    const cancel = createTurnStateFromRepositories(
      fakeRepositories({
        claimTurnRun: () =>
          Promise.resolve({
            record: { ...assistantTurnRecord("turn_claim"), cancelRequestedAt: NOW },
            claimed: false,
          }),
      }),
    );
    const fenced = createTurnStateFromRepositories(
      fakeRepositories({
        claimTurnRun: () =>
          Promise.resolve({
            record: { ...assistantTurnRecord("turn_claim"), status: "failed" },
            claimed: false,
          }),
      }),
    );

    await expect(execute.claimRun(turn, "run_1")).resolves.toBe(TURN_CLAIM_DISPOSITIONS.EXECUTE);
    await expect(cancel.claimRun(turn, "run_1")).resolves.toBe(TURN_CLAIM_DISPOSITIONS.CANCEL);
    await expect(fenced.claimRun(turn, "run_1")).resolves.toBe(TURN_CLAIM_DISPOSITIONS.FENCED);
  });

  it("maps an unresolved run to RUN_NOT_FOUND on assertRunOwned", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        findAssistantTurnByRun: () => Promise.resolve(undefined),
      }),
    );

    await expect(state.assertRunOwned(AUTH, "conversation_1", "run_x")).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.RUN_NOT_FOUND,
    });
  });

  it("maps an unresolved run to RUN_NOT_FOUND on run-only access", async () => {
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        findAssistantTurnByRun: () => Promise.resolve(undefined),
      }),
    );

    await expect(state.assertAccessible(AUTH, "run_x")).rejects.toMatchObject({
      code: TURN_REJECTION_CODES.RUN_NOT_FOUND,
    });
  });

  it("folds usage into an output-less aggregate finalization", async () => {
    let finalizeCommand: FinalizeAssistantTurnCommand | undefined;
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        createOrGetConversation: () => ok(conversationRecord()),
        appendMessage: () => ok(messageRecord()),
        startAssistantTurn: () => ok(assistantTurnRecord("turn_claim")),
        finalizeAssistantTurn: (command) => {
          finalizeCommand = command;
          return Promise.resolve({
            record: assistantTurnRecord("turn_claim"),
            claimed: true,
          });
        },
      }),
    );

    const turn = await state.beginTurn(BEGIN_INPUT);
    const claimed = await state.finalize(turn, {
      terminal: {
        status: TURN_TERMINAL_STATUSES.FAILED,
        usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
        safeErrorCode: "model_stream_failed",
      },
    });

    expect(claimed).toBe(true);
    expect(finalizeCommand).toMatchObject({
      assistantTurnId: "turn_claim",
      status: "failed",
      errorCode: "model_stream_failed",
      usage: {
        inputTokens: 4,
        outputTokens: 6,
        totalTokens: 10,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
    });
    expect(finalizeCommand).not.toHaveProperty("assistantMessage");
  });

  it("maps assistant output into the same aggregate finalization command", async () => {
    let finalizeCommand: FinalizeAssistantTurnCommand | undefined;
    const state = createTurnStateFromRepositories(
      fakeRepositories({
        createOrGetConversation: () => ok(conversationRecord()),
        appendMessage: () => ok(messageRecord()),
        startAssistantTurn: () => ok(assistantTurnRecord("turn_msg")),
        finalizeAssistantTurn: (command) => {
          finalizeCommand = command;
          return Promise.resolve({
            record: assistantTurnRecord("turn_msg"),
            claimed: true,
          });
        },
      }),
    );

    const turn = await state.beginTurn(BEGIN_INPUT);
    await state.finalize(turn, {
      terminal: {
        status: TURN_TERMINAL_STATUSES.COMPLETED,
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
      assistantMessage: {
        id: "assistant_1",
        role: TURN_MESSAGE_ROLES.ASSISTANT,
        parts: [{ type: "text", text: "Hi there" }],
      },
    });

    expect(finalizeCommand).toMatchObject({
      workspaceId: AUTH.workspaceId,
      assistantTurnId: "turn_msg",
      status: "completed",
      assistantMessage: {
        messageId: "assistant_1",
        parts: [{ type: "text", text: "Hi there" }],
        metadataJson: {},
      },
    });
  });
});
