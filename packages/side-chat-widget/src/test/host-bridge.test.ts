import { describe, expect, it } from "vitest";
import { createChatRequestPayload } from "../adapters/react/use-side-chat.js";

describe("host bridge request payload", () => {
  it("includes a serializable host context snapshot", () => {
    expect(
      createChatRequestPayload({
        workspaceId: "demo-workspace",
        conversationId: "demo-conversation-001",
        messageId: "msg-1",
        content: "show overdue tasks",
        model: { provider: "openai", id: "gpt-5.4-nano" },
        hostContext: {
          pageId: "advisory-workbench",
          title: "Advisory Dashboard",
          resources: [
            {
              id: "tasks",
              kind: "grid",
              label: "Tasks",
              rowCount: 120,
              columns: [
                {
                  id: "dueDate",
                  label: "Due Date",
                  type: "date",
                  sortable: true,
                  filterable: true,
                },
              ],
            },
          ],
        },
      }),
    ).toMatchObject({
      workspaceId: "demo-workspace",
      hostContext: {
        resources: [{ id: "tasks", kind: "grid" }],
      },
    });
  });
});
