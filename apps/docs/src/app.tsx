import widgetTokenSource from "@side-chat/side-chat-widget/styles.css?raw";

import { TokenConfigurator } from "./configurator/token-configurator.js";
import { extractCssTokens, extractThemeIds, groupCssTokens } from "./token-catalog.js";

const TOKENS = extractCssTokens(widgetTokenSource);
const TOKEN_GROUPS = groupCssTokens(TOKENS);
const THEMES = extractThemeIds(widgetTokenSource);

export function App() {
  return <TokenConfigurator groups={TOKEN_GROUPS} themes={THEMES} tokens={TOKENS} />;
}
