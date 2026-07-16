export {
  carryTranscriptActivity,
  contextTokensFromUsage,
  createDefaultRequest,
  createId,
  createWidgetChatRequest,
  createWidgetMessage,
  findLastUserMessage,
  messagesBeforeMessage,
  toErrorMessage,
  updateMessage,
  WIDGET_STATUSES,
} from "./model/widget-chat.js";
export {
  applyActivityEvent,
  completeActivityTimeline,
  createEmptyActivityTimeline,
  toJsonObject,
  updateActivityItem,
} from "./model/activity.js";
// Protocol event builders for widget DOM/model tests. Re-exported from the entity
// barrel so package-private `#entities/chat` consumers (the test env fixture) reach
// them without a relative import that crosses the widgets -> entities boundary.
export { baseEvent, completed, delta, started } from "./model/widget-stream-fixtures.js";
export type {
  WidgetChatRequestInput,
  WidgetMessage,
  WidgetRunNotice,
  WidgetStatus,
  WidgetUsage,
} from "./model/widget-chat.js";
export type { WidgetActivityItem, WidgetActivityTimeline } from "./model/activity.js";
