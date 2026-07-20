import { defineSideChatIntegration } from "@side-chat/side-chat-server";

import { MOCK_WEB_SEARCH_TOOL } from "./tool.js";

export { MOCK_WEB_SEARCH_TOOL_NAME } from "./tool.js";

export const MOCK_WEB_SEARCH_INTEGRATION = defineSideChatIntegration({
  name: "mock-web-search",
  serverTools: [MOCK_WEB_SEARCH_TOOL],
});
