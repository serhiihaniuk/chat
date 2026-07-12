import { describe, expect, it } from "vitest";
import type { JsonObject } from "@side-chat/shared";
import { DbRepositoryError } from "@side-chat/db";

import type {
  ConversationHistoryPage,
  ConversationQueryStore,
} from "#application/ports/conversation-query-store";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";

describe("conversation query routes", () => {
  it("serves route-owned conversation and model DTOs behind authentication", async () => {
    const harness = await createServiceTestHarness({ conversationQueries: queryStore() });
    try {
      const conversations = await harness.request("/api/conversations");
      expect(await conversations.json()).toEqual({
        conversations: [
          {
            id: "conversation-1",
            status: "active",
            title: "A conversation",
            lastMessageAt: "2026-07-11T00:00:00Z",
          },
        ],
      });

      const models = await harness.request("/api/models");
      expect(await models.json()).toEqual({
        models: [{ id: "complete", provider: "scripted" }],
        defaultModelId: "complete",
      });

      const unauthenticated = await harness.unauthenticatedRequest("/api/conversations");
      expect(unauthenticated.status).toBe(401);
    } finally {
      await harness.close();
    }
  });

  it("degrades drift without failing the history list", async () => {
    const harness = await createServiceTestHarness({
      conversationQueries: queryStore({
        parts: [
          { type: "text", text: "safe" },
          { type: "tool-removed", toolCallId: "call-1", state: "input-available", input: {} },
        ],
      }),
    });
    try {
      const response = await harness.request("/api/conversations/conversation-1/messages");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        messages: [{ id: "message-1", role: "assistant", parts: [{ type: "text", text: "safe" }] }],
        hasMore: false,
      });
      expect(harness.telemetry.records).toContainEqual({ type: "persistence.history_drift" });
    } finally {
      await harness.close();
    }
  });

  it("threads the backward cursor so older pages stay reachable", async () => {
    const pages = new Map<number | undefined, ConversationHistoryPage>([
      [
        undefined,
        {
          messages: [storedText("m4"), storedText("m5")],
          hasMoreBefore: true,
          nextBeforeSequenceIndex: 4,
        },
      ],
      [
        4,
        {
          messages: [storedText("m2"), storedText("m3")],
          hasMoreBefore: true,
          nextBeforeSequenceIndex: 2,
        },
      ],
      [2, { messages: [storedText("m1")], hasMoreBefore: false }],
    ]);
    const received: (number | undefined)[] = [];
    const store = queryStore();
    store.readHistory = (_auth, _conversationId, query) => {
      received.push(query?.beforeSequenceIndex);
      return Promise.resolve(
        pages.get(query?.beforeSequenceIndex) ?? { messages: [], hasMoreBefore: false },
      );
    };
    const harness = await createServiceTestHarness({ conversationQueries: store });
    try {
      const first = await harness.request("/api/conversations/conversation-1/messages?limit=2");
      expect(await first.json()).toEqual({
        messages: [uiText("m4"), uiText("m5")],
        hasMore: true,
        nextCursor: 4,
      });

      const second = await harness.request(
        "/api/conversations/conversation-1/messages?before=4&limit=2",
      );
      expect(await second.json()).toEqual({
        messages: [uiText("m2"), uiText("m3")],
        hasMore: true,
        nextCursor: 2,
      });

      const third = await harness.request(
        "/api/conversations/conversation-1/messages?before=2&limit=2",
      );
      expect(await third.json()).toEqual({ messages: [uiText("m1")], hasMore: false });

      expect(received).toEqual([undefined, 4, 2]);
    } finally {
      await harness.close();
    }
  });

  it("rejects a malformed paging cursor", async () => {
    const harness = await createServiceTestHarness({ conversationQueries: queryStore() });
    try {
      const response = await harness.request(
        "/api/conversations/conversation-1/messages?before=-1",
      );
      expect(response.status).toBe(400);
    } finally {
      await harness.close();
    }
  });

  it("hides an unknown conversation on the in-memory store instead of erroring", async () => {
    // No conversationQueries override: the route reads the real in-memory store,
    // which reports an unknown id with a `TurnRejectedError`, not a db error code.
    const harness = await createServiceTestHarness();
    try {
      const history = await harness.request("/api/conversations/conversation-unknown/messages");
      expect(history.status).toBe(404);

      const active = await harness.request("/api/conversations/conversation-unknown/active-turn");
      expect(active.status).toBe(200);
      expect(await active.json()).toEqual({ activeTurn: null });
    } finally {
      await harness.close();
    }
  });

  it("returns the bound running turn and becomes empty after terminal", async () => {
    let running = true;
    const store = queryStore();
    store.findActiveTurn = () =>
      Promise.resolve(
        running ? { turnId: "turn-1", runId: "run-1", status: "running" } : undefined,
      );
    const harness = await createServiceTestHarness({ conversationQueries: store });
    try {
      const active = await harness.request("/api/conversations/conversation-1/active-turn");
      expect(await active.json()).toEqual({
        activeTurn: { turnId: "turn-1", runId: "run-1", status: "running" },
      });

      running = false;
      const terminal = await harness.request("/api/conversations/conversation-1/active-turn");
      expect(await terminal.json()).toEqual({ activeTurn: null });
    } finally {
      await harness.close();
    }
  });

  it("keeps list, history, and discovery isolated across two tenants", async () => {
    const harness = await createServiceTestHarness({
      authorizer: {
        authorize: ({ bearerToken }) => {
          let tenant: string | undefined;
          if (bearerToken === "Bearer tenant-a") tenant = "a";
          if (bearerToken === "Bearer tenant-b") tenant = "b";
          return Promise.resolve(
            tenant
              ? {
                  workspaceId: `workspace-${tenant}`,
                  subjectId: `subject-${tenant}`,
                  issuedAt: "2026-07-11T00:00:00Z",
                }
              : undefined,
          );
        },
      },
      conversationQueries: tenantQueryStore(),
    });
    const requestAs = (tenant: string, path: string) =>
      harness.app.request(path, { headers: { authorization: `Bearer tenant-${tenant}` } });
    try {
      const list = await requestAs("a", "/api/conversations");
      expect(await list.json()).toEqual({
        conversations: [
          { id: "conversation-a", status: "active", lastMessageAt: "2026-07-11T00:00:00Z" },
        ],
      });

      const ownHistory = await requestAs("a", "/api/conversations/conversation-a/messages");
      expect(ownHistory.status).toBe(200);
      const otherHistory = await requestAs("a", "/api/conversations/conversation-b/messages");
      expect(otherHistory.status).toBe(404);

      const otherDiscovery = await requestAs("a", "/api/conversations/conversation-b/active-turn");
      expect(await otherDiscovery.json()).toEqual({ activeTurn: null });
    } finally {
      await harness.close();
    }
  });
});

function storedText(id: string) {
  return { id, role: "assistant", parts: [{ type: "text", text: id }], metadata: {} };
}

function uiText(id: string) {
  return { id, role: "assistant", parts: [{ type: "text", text: id }], metadata: {} };
}

function queryStore(history: { readonly parts: readonly JsonObject[] } = { parts: [] }) {
  const store: {
    readHistory: ConversationQueryStore["readHistory"];
    listConversations: ConversationQueryStore["listConversations"];
    findActiveTurn: ConversationQueryStore["findActiveTurn"];
  } = {
    readHistory: () =>
      Promise.resolve({
        messages: [{ id: "message-1", role: "assistant", parts: history.parts, metadata: {} }],
        hasMoreBefore: false,
      }),
    listConversations: () =>
      Promise.resolve([
        {
          id: "conversation-1",
          status: "active",
          title: "A conversation",
          lastMessageAt: "2026-07-11T00:00:00Z",
        },
      ]),
    findActiveTurn: () => Promise.resolve(undefined),
  };
  return store;
}

function tenantQueryStore(): ConversationQueryStore {
  const owns = (workspaceId: string, conversationId: string) =>
    conversationId === `conversation-${workspaceId.slice(-1)}`;
  return {
    listConversations: (auth) =>
      Promise.resolve([
        {
          id: `conversation-${auth.workspaceId.slice(-1)}`,
          status: "active",
          lastMessageAt: "2026-07-11T00:00:00Z",
        },
      ]),
    readHistory: (auth, conversationId) => {
      if (!owns(auth.workspaceId, conversationId)) {
        return Promise.reject(new DbRepositoryError("cross_tenant_access_denied", "hidden"));
      }
      return Promise.resolve({
        messages: [
          {
            id: `message-${auth.workspaceId}`,
            role: "user",
            parts: [{ type: "text", text: "own" }],
            metadata: {},
          },
        ],
        hasMoreBefore: false,
      });
    },
    findActiveTurn: (auth, conversationId) =>
      Promise.resolve(
        owns(auth.workspaceId, conversationId)
          ? {
              turnId: `turn-${auth.workspaceId}`,
              runId: `run-${auth.workspaceId}`,
              status: "running",
            }
          : undefined,
      ),
  };
}
