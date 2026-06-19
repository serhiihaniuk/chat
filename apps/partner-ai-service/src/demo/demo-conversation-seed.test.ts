import {
  createMemorySidechatRepositories,
  toConversationId,
  toSubjectId,
  toWorkspaceId,
} from "@side-chat/db";
import { describe, expect, it } from "vitest";
import { seedDemoConversations } from "./demo-conversation-seed.js";

const workspace = { tenantId: "tenant_demo", workspaceId: "workspace_demo" } as const;
const workspaceId = toWorkspaceId(workspace.workspaceId);
const subjectId = toSubjectId(`${workspace.workspaceId}:subject`);

describe("demo conversation seed", () => {
  it("preloads local fake-demo conversations through memory repositories", async () => {
    const repositories = createMemorySidechatRepositories({ idPrefix: "seed-test" });

    await seedDemoConversations(repositories, workspace);
    await seedDemoConversations(repositories, workspace);

    const conversations = await repositories.listConversations({
      workspaceId,
      subjectId,
      limit: 10,
    });
    expect(conversations.map((conversation) => conversation.titleText)).toEqual([
      "Assistant Mission Overview",
      "Workbench iframe checklist",
      "Thinking levels demo",
      "Local persistence smoke",
    ]);

    const history = await repositories.readConversationHistory({
      workspaceId,
      subjectId,
      conversationId: toConversationId("demo_thinking"),
      limit: 10,
    });
    expect(history.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(history.map((message) => message.contentText)).toEqual([
      "Show how fake thinking levels work.",
      expect.stringContaining("Pick low, medium, or high"),
    ]);
    expect(repositories.snapshot().messages).toHaveLength(8);
  });
});
