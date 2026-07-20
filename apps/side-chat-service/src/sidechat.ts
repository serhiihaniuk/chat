import {
  defineSideChat,
  selectRegisteredServerTools as selectFrameworkServerTools,
  serverToolsForSideChat,
} from "@side-chat/side-chat-server";

import {
  MOCK_WEB_SEARCH_INTEGRATION,
  MOCK_WEB_SEARCH_TOOL_NAME,
} from "./integrations/mock-web-search/index.js";

/** The one adopter-owned catalog reconstructed by route and Workflow composition. */
export const SIDE_CHAT = defineSideChat({
  integrations: [MOCK_WEB_SEARCH_INTEGRATION],
});

export const REGISTERED_SERVER_TOOLS = serverToolsForSideChat(SIDE_CHAT);

export function selectRegisteredServerTools(names: readonly string[]) {
  return selectFrameworkServerTools(SIDE_CHAT, names);
}

export { MOCK_WEB_SEARCH_TOOL_NAME };
