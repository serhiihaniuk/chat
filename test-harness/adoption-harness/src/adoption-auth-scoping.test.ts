import { SIDECHAT_EVENT_TYPES, decodeSseEvents } from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories } from "@side-chat/db";
import type { AuthContext } from "@side-chat/partner-ai-core";
import {
  createPartnerAiServiceApp,
  type PartnerAiServiceApp,
  type ServiceAuthVerifier,
} from "@side-chat/partner-ai-service";
import { createWidgetChatRequest } from "@side-chat/side-chat-widget/testing";
import { describe, expect, it } from "vitest";

const WORKSPACE = { tenantId: "tenant_adopt", workspaceId: "workspace_adopt" } as const;
const TOKEN_A = "Bearer adopter-token-a";
const TOKEN_B = "Bearer adopter-token-b";

/**
 * A stand-in for an adopter's JWT/session check: it maps a bearer token to a
 * subject and returns a full `AuthContext`. Everything downstream scopes by
 * `subject.subjectId`. This is exactly the seam an embedder plugs their own
 * verifier into — no edits to `app.ts`.
 */
const subjectVerifier = (
  tokenToSubject: Readonly<Record<string, string>>,
): ServiceAuthVerifier => ({
  resolveAuthContext: (input) => {
    const subjectId = input.bearerToken ? tokenToSubject[input.bearerToken] : undefined;
    return Promise.resolve(subjectId ? authContextFor(subjectId) : undefined);
  },
});

const authContextFor = (subjectId: string): AuthContext => ({
  ...WORKSPACE,
  subject: { subjectId, userId: `${subjectId}_user` },
  actor: { subjectId, userId: `${subjectId}_user` },
  source: "test_authority",
  issuedAt: "2026-07-03T00:00:00.000Z",
});

const createScopedApp = (): PartnerAiServiceApp =>
  createPartnerAiServiceApp({
    workspace: WORKSPACE,
    repositories: createMemorySidechatRepositories({ idPrefix: "adopt_auth" }),
    runtime: { provider: "fake" },
    // No `auth` config at all: the custom verifier fully replaces the built-in
    // static-token adapter, proving the seam works with zero app wiring.
    authVerifier: subjectVerifier({ [TOKEN_A]: "subject_a", [TOKEN_B]: "subject_b" }),
    resumability: { safetyPollIntervalMs: 10 },
  });

const authHeaders = (token: string) => ({
  authorization: token,
  "content-type": "application/json",
});

const startTurnAsSubject = async (
  app: PartnerAiServiceApp,
  token: string,
): Promise<{ readonly assistantTurnId: string; readonly conversationId: string }> => {
  const request = createWidgetChatRequest({
    turnProfileId: undefined,
    conversationId: undefined,
    hostContext: undefined,
    message: "isolate me",
    messageId: "message_isolation_1",
    requestId: "request_isolation_1",
  });
  const response = await app.request("/chat/runs", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(200);
  const started = decodeSseEvents(await response.text()).find(
    (event) => event.type === SIDECHAT_EVENT_TYPES.STARTED,
  );
  if (started?.type !== SIDECHAT_EVENT_TYPES.STARTED || !started.conversationId) {
    throw new Error("Expected a sidechat.started frame with a conversation id.");
  }
  return { assistantTurnId: started.assistantTurnId, conversationId: started.conversationId };
};

describe("adopter auth seam and subject scoping", () => {
  it("authenticates through a custom verifier with no static-token config", async () => {
    const app = createScopedApp();

    // A mapped token authenticates; an unmapped/absent token is rejected.
    const { assistantTurnId } = await startTurnAsSubject(app, TOKEN_A);
    expect(assistantTurnId).toBeTruthy();

    const anonymous = await app.request(`/chat/turns/${assistantTurnId}`, {
      headers: authHeaders("Bearer not-a-known-token"),
    });
    expect(anonymous.status).toBe(401);
  });

  it("isolates one subject's turn from another subject in the same workspace", async () => {
    const app = createScopedApp();
    const { assistantTurnId, conversationId } = await startTurnAsSubject(app, TOKEN_A);

    // Owner (A) reads its own turn.
    const ownerStatus = await app.request(`/chat/turns/${assistantTurnId}`, {
      headers: authHeaders(TOKEN_A),
    });
    expect(ownerStatus.status).toBe(200);

    // Subject B cannot read the status or stream of A's turn (IDOR closed).
    const otherStatus = await app.request(`/chat/turns/${assistantTurnId}`, {
      headers: authHeaders(TOKEN_B),
    });
    expect(otherStatus.status).toBe(404);
    const otherStream = await app.request(`/chat/turns/${assistantTurnId}/stream?after=-1`, {
      headers: authHeaders(TOKEN_B),
    });
    expect(otherStream.status).toBe(404);

    // Subject B cannot post a host-command result against A's turn.
    const otherHostResult = await app.request(
      `/chat/turns/${assistantTurnId}/host-commands/command_x/result`,
      {
        method: "POST",
        headers: authHeaders(TOKEN_B),
        body: JSON.stringify({ status: "applied" }),
      },
    );
    expect(otherHostResult.status).toBe(404);

    // Subject B cannot cancel A's turn: the scoped CAS matches nothing, so it is a
    // durable no-op rather than a stop.
    const otherCancel = await app.request(`/chat/turns/${assistantTurnId}/cancel`, {
      method: "POST",
      headers: authHeaders(TOKEN_B),
    });
    expect(otherCancel.status).toBe(200);
    expect(await otherCancel.json()).toMatchObject({ cancelRequested: false });

    // Subject B does not see A's conversation in its own list.
    const otherConversations = await app.request("/chat/conversations", {
      headers: authHeaders(TOKEN_B),
    });
    expect(otherConversations.status).toBe(200);
    const listed = (await otherConversations.json()) as { readonly conversations?: unknown[] };
    const ids = (listed.conversations ?? []).map((entry) => (entry as { id?: string }).id);
    expect(ids).not.toContain(conversationId);
  });
});
