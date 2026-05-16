/**
 * Public package boundary. Host apps should import from here so the widget can
 * refactor its frontend hexagon internals without breaking consumers.
 */
export { SideChatWidget } from "./ui/side-chat-widget/SideChatWidget.js";
export { useSideChat } from "./adapters/react/use-side-chat.js";
export {
  Citation,
  Citations,
  citationSelectedEventName,
} from "./shared/ui/ai-elements/citation.js";
export type {
  SideChatHostBridge,
  SideChatIdentity,
  SideChatTransport,
} from "./ports/widget-contracts.js";
export type {
  SideChatWidgetProps,
} from "./ui/side-chat-widget/SideChatWidget.js";
export type {
  CitationProps,
  CitationSource,
  CitationsProps,
} from "./shared/ui/ai-elements/citation.js";
export type {
  SideChatError,
  UseSideChatOptions,
  WidgetMessage,
} from "./adapters/react/use-side-chat.js";
