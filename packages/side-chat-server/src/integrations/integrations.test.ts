import { describe, expect, it } from "vitest";

import { SERVER_TOOL_APPROVAL_POLICIES, defineServerTool } from "#server-tools";
import {
  defineSideChat,
  defineSideChatIntegration,
  selectRegisteredServerTools,
  serverToolsForSideChat,
} from "./index.js";

const tool = defineServerTool({
  name: "issues.create",
  description: "Create an issue.",
  inputSchema: { type: "object" },
  validateInput: (input): input is null => input === null,
  approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
  execute: async () => ({ created: true }),
});

describe("Side Chat composition manifest", () => {
  it("collects integration tools into one selectable catalog", () => {
    const definition = defineSideChat({
      integrations: [defineSideChatIntegration({ name: "issues", serverTools: [tool] })],
    });

    expect(serverToolsForSideChat(definition)).toEqual([tool]);
    expect(selectRegisteredServerTools(definition, [tool.name])).toEqual([tool]);
  });

  it("fails fast for duplicate and unregistered names", () => {
    expect(() =>
      defineSideChat({
        integrations: [
          { name: "issues", serverTools: [tool] },
          { name: "issues", serverTools: [] },
        ],
      }),
    ).toThrow("Duplicate integration name");

    const definition = defineSideChat({ integrations: [{ name: "issues", serverTools: [tool] }] });
    expect(() => selectRegisteredServerTools(definition, ["missing"])).toThrow(
      "Server tool is not registered: missing",
    );
  });
});
