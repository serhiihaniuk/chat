import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { HTTP_ERROR } from "#adapters/http/error-response";
import { CHAT_HTTP_ROUTES } from "#adapters/http/http-contract";
import { InMemoryTurnState } from "#adapters/persistence/in-memory-turn-state";
import { HOST_CONTEXT_TRUST_LABEL } from "#application/turn/execution/host-context/render-host-context";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";
import { SCRIPTED_PROVIDER } from "#config/providers/scripted-provider-config";
import { TURN_MESSAGE_ROLES } from "#domain/turn/turn";
import { DeterministicTurnExecution } from "#testing/turn/deterministic-turn-execution";

const CONVERSATION = {
  conversationId: "conversation-1",
  workspaceId: "local-workspace",
  subjectId: "local-workspace:subject",
} as const;
const USER_MESSAGE_TEXT = "Summarize this page";
const USER_MESSAGE: UIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: USER_MESSAGE_TEXT }],
};
const RAW_CONTEXT_SENTINEL = "RAW_HOST_CONTEXT_MUST_NOT_LEAK";

describe("chat host context", () => {
  it("uses each request's accepted context only in its current user execution message", async () => {
    const contexts = [
      { schemaVersion: "host.v1", title: "Release Alpha", metadata: { releaseId: "alpha" } },
      { schemaVersion: "host.v1", title: "Release Beta", metadata: { releaseId: "beta" } },
    ];

    for (const hostContext of contexts) {
      const execution = new DeterministicTurnExecution();
      const harness = await createServiceTestHarness({ turnExecution: execution });
      try {
        const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest(hostContext));
        expect(response.status).toBe(200);
        await response.text();

        const executionMessages = execution.started[0]?.messages ?? [];
        expect(executionMessages.map((message) => message.role)).toEqual(["user"]);
        expect(executionMessages[0]?.text).toContain(HOST_CONTEXT_TRUST_LABEL);
        expect(executionMessages[0]?.text).toContain(hostContext.title);
        expect(executionMessages[0]?.text).toContain(USER_MESSAGE_TEXT);
        expect(harness.turnState.userMessages).toEqual([
          { id: USER_MESSAGE.id, role: TURN_MESSAGE_ROLES.USER, text: USER_MESSAGE_TEXT },
        ]);
      } finally {
        await harness.close();
      }
    }
  });

  it("returns the existing safe 400 for malformed or over-limit context", async () => {
    const execution = new DeterministicTurnExecution();
    const harness = await createServiceTestHarness({ turnExecution: execution });
    try {
      for (const hostContext of invalidContexts()) {
        const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest(hostContext));
        expect(response.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
        const responseText = await response.text();
        expect(responseText).toContain(HTTP_ERROR.BAD_REQUEST.CODE);
        expect(responseText).not.toContain(RAW_CONTEXT_SENTINEL);
      }
      expect(execution.started).toEqual([]);
      expect(harness.turnState.userMessages).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("cannot change the authenticated workspace or subject", async () => {
    const state = new InMemoryTurnState([
      {
        conversationId: CONVERSATION.conversationId,
        workspaceId: "another-workspace",
        subjectId: "another-subject",
      },
    ]);
    const execution = new DeterministicTurnExecution();
    const harness = await createServiceTestHarness({
      turnState: state,
      turnExecution: execution,
    });
    try {
      const response = await harness.request(
        CHAT_HTTP_ROUTES.START,
        chatRequest({
          schemaVersion: "host.v1",
          metadata: {
            workspaceId: CONVERSATION.workspaceId,
            subjectId: CONVERSATION.subjectId,
          },
        }),
      );

      expect(response.status).toBe(HTTP_ERROR.FORBIDDEN.STATUS);
      expect(execution.started).toEqual([]);
      expect(state.userMessages).toEqual([]);
    } finally {
      await harness.close();
    }
  });
});

function chatRequest(hostContext: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      conversationId: CONVERSATION.conversationId,
      messages: [USER_MESSAGE],
      modelPreference: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
      hostContext,
    }),
  };
}

function invalidContexts(): readonly unknown[] {
  return [
    RAW_CONTEXT_SENTINEL,
    { schemaVersion: "host.v1", extra: RAW_CONTEXT_SENTINEL },
    { schemaVersion: "host.v1", metadata: deepMetadata(9) },
    { schemaVersion: "host.v1", metadata: wideMetadata(129) },
    oversizedSerializedContext(),
  ];
}

function deepMetadata(depth: number): unknown {
  let value: unknown = "leaf";
  for (let level = 0; level < depth; level += 1) value = { child: value };
  return value;
}

function wideMetadata(entries: number): Record<string, boolean> {
  return Object.fromEntries(
    Array.from({ length: entries }, (_, index) => [`entry-${index}`, true]),
  );
}

function oversizedSerializedContext() {
  const value = "x".repeat(4_096);
  return {
    schemaVersion: "host.v1",
    origin: value,
    url: value,
    title: value,
    metadata: { value },
  };
}
