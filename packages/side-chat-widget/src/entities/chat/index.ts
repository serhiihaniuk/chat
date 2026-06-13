export {
  createDefaultRequest,
  createId,
  createWidgetChatRequest,
  createWidgetMessage,
  toErrorMessage,
  updateMessage,
} from "./model/widget-chat.js";
export {
  applyActivityEvent,
  completeActivityTimeline,
  createEmptyActivityTimeline,
  toJsonObject,
  updateActivityItem,
} from "./model/activity.js";
export type {
  WidgetChatRequestInput,
  WidgetMessage,
  WidgetStatus,
  WidgetUsage,
} from "./model/widget-chat.js";
export type { WidgetActivityItem, WidgetActivityTimeline } from "./model/activity.js";
