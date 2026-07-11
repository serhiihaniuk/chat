import { describe, expect, it } from "vitest";

import { toMessageId } from "#schema-contract";
import type { SidechatRepositories } from "#repositories/contract";
import {
  actorId,
  appendUserMessage,
  closeIfNeeded,
  createConversation,
  now,
  subjectId,
  workspaceId,
} from "./repository-contract.helpers.js";

export const conversationListRepositoryContract = (
  label: string,
  createRepositories: () => SidechatRepositories,
) => {
  let scopeCounter = 0;
  const nextScope = () => `${label.replace(/\W+/gu, "_")}_list_${++scopeCounter}`;

  describe("conversation list repository contract", () => {
    it("returns an existing conversation by id when a follow-up key differs from the stored key", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        // The first turn stores a key ("default"); the follow-up turn continues by id,
        // passing the conversationId as its key. The stored key differs, so it must be
        // found by id — not recreated (memory) or crashed on the primary key (postgres).
        const created = await createConversation(repositories, scope);
        const followUp = await repositories.createOrGetConversation({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          actorId: actorId(scope),
          conversationId: created.conversationId,
          conversationKey: created.conversationId,
          now,
        });

        expect(followUp.inserted).toBe(false);
        expect(followUp.record.conversationId).toBe(created.conversationId);
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("lists subject conversations newest first with safe titles", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const older = await createConversation(repositories, scope);
        await appendUserMessage(repositories, scope, older.conversationId);
        const newer = await repositories.createOrGetConversation({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          actorId: actorId(scope),
          conversationId: `conversation_${scope}_newer`,
          conversationKey: `conversation_${scope}_newer`,
          now: "2026-05-23T13:01:00.000Z",
        });
        await repositories.appendMessage({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          conversationId: newer.record.conversationId,
          messageId: toMessageId(`${newer.record.conversationId}:user`),
          role: "user",
          parts: [{ type: "text", text: "newer chat title" }],
          metadataJson: {},
          now: "2026-05-23T13:01:00.000Z",
        });

        await repositories.createOrGetConversation({
          workspaceId: workspaceId(scope),
          subjectId: "other_subject",
          actorId: actorId(scope),
          conversationKey: "other_subject_chat",
          now,
        });
        const listed = await repositories.listConversations({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          limit: 10,
        });

        expect(listed.map((conversation) => conversation.conversationId)).toEqual([
          newer.record.conversationId,
          older.conversationId,
        ]);
        expect(listed.map((conversation) => conversation.titleText)).toEqual([
          "newer chat title",
          "hello",
        ]);
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("prefers a prepared title and keeps it write-once", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const conversation = await createConversation(repositories, scope);
        await appendUserMessage(repositories, scope, conversation.conversationId);

        await repositories.prepareConversationTitle({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          conversationId: conversation.conversationId,
          titleText: "Prepared title",
          now,
        });
        await repositories.prepareConversationTitle({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          conversationId: conversation.conversationId,
          titleText: "Ignored replacement title",
          now: "2026-05-23T13:02:00.000Z",
        });

        const listed = await repositories.listConversations({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          limit: 10,
        });

        expect(listed[0]?.titleText).toBe("Prepared title");
      } finally {
        await closeIfNeeded(repositories);
      }
    });
  });
};
