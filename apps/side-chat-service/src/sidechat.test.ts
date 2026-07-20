import { describe, expect, it } from "vitest";
import { toServerToolCatalog } from "@side-chat/side-chat-server";

import {
  DEFAULT_MOCK_WEB_SEARCH_MODEL_ID,
  MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
} from "./integrations/mock-web-search/tool.js";
import {
  MOCK_WEB_SEARCH_TOOL_NAME,
  REGISTERED_SERVER_TOOLS,
  selectRegisteredServerTools,
} from "./sidechat.js";

describe("adopter Side Chat definition", () => {
  it("drives both execution selection and the public picker catalog", () => {
    const selected = selectRegisteredServerTools([MOCK_WEB_SEARCH_TOOL_NAME]);

    expect(selected).toEqual(REGISTERED_SERVER_TOOLS);
    expect(toServerToolCatalog(selected)).toEqual([
      {
        name: MOCK_WEB_SEARCH_TOOL_NAME,
        label: "Mock web search",
        description: MOCK_WEB_SEARCH_TOOL_DESCRIPTION,
        defaultEnabled: true,
      },
    ]);
    expect(selected[0]?.internalModelIds).toEqual([DEFAULT_MOCK_WEB_SEARCH_MODEL_ID]);
  });

  it("fails closed for an unregistered deployment selection", () => {
    expect(() => selectRegisteredServerTools(["missing_tool"])).toThrow(
      "Server tool is not registered: missing_tool",
    );
  });
});
