// The one place the widget's built-in copy lives, and the seam that makes it
// rebrandable/localizable. `WidgetLabels` is a FLAT bag of strings (and a few format
// functions where a count or duration is interpolated); `defaultWidgetLabels` holds
// the shipped English, and callers override any subset through the public
// `SideChatWidgetLabels` (`Partial`). A React context threads the resolved labels to
// every layer so shared/ui leaves read copy without prop-drilling.
//
// Scope: conversational + chrome + notice/activity surfaces. Design-identity copy
// (theme names, appearance option labels like "Sharp"/"Cozy", accent names) stays in
// the single-sourced design vocabulary (see widget-themes.ts) and is intentionally
// not part of this override surface.
import { createContext, useContext } from "react";

export type WidgetLabels = {
  // The widget title (header + launcher + empty-state greeting) and the composer's
  // placeholder + send/stop labels — the primary composer controls.
  readonly title: string;
  readonly placeholder: string;
  readonly send: string;
  readonly stop: string;
  readonly emptyStateTitle: string;
  // Shown when a host bridge supplies page context vs. when the widget stands alone,
  // so the "I can see the page you're viewing" claim is only made when it is true.
  readonly emptyStateWithContext: string;
  readonly emptyStateWithoutContext: string;
  readonly composerInputAria: string;
  readonly noticeError: string;
  readonly noticeRetry: string;
  readonly noticeBlocked: string;
  readonly noticeCancelled: string;
  readonly noticeTruncated: string;
  readonly noticeConnectionLost: string;
  readonly activityApprovalRequired: string;
  readonly approvalApprove: string;
  readonly approvalDeny: string;
  readonly approvalApproved: string;
  readonly approvalDenied: string;
  readonly approvalExpired: string;
  readonly approvalUnavailable: string;
  readonly activityPreparing: string;
  readonly activityThinking: string;
  readonly activityThoughtProcess: string;
  readonly activityThoughtForSeconds: (seconds: number) => string;
  readonly activitySources: (count: number) => string;
  readonly conversationNewChat: string;
  readonly conversationSelectChat: string;
  readonly conversationGenerating: string;
  readonly relativeNow: string;
  readonly relativeYesterday: string;
  readonly relativeMinutesAgo: (minutes: number) => string;
  readonly relativeHoursAgo: (hours: number) => string;
  readonly relativeDaysAgo: (days: number) => string;
  readonly groupRecent: string;
  readonly groupYesterday: string;
  readonly groupPreviousWeek: string;
  readonly groupPreviousMonth: string;
  readonly groupOlder: string;
  readonly headerRefresh: string;
  readonly headerSettings: string;
  readonly headerNewChat: string;
  readonly headerClose: string;
  readonly headerBack: string;
  readonly headerSettingsTitle: string;
  readonly headerConversations: string;
  readonly headerConversationFeed: string;
  // Modal chrome + the markdown link-safety confirm (Dialog; every external
  // link in assistant output opens through it).
  readonly dialogClose: string;
  readonly linkSafetyTitle: string;
  readonly linkSafetyDescription: string;
  readonly linkSafetyCopy: string;
  readonly linkSafetyCopied: string;
  readonly linkSafetyOpen: string;
};

/** Public override surface: any subset of the built-in copy. */
export type SideChatWidgetLabels = Partial<WidgetLabels>;

export const defaultWidgetLabels: WidgetLabels = {
  title: "Workspace Assistant",
  placeholder: "Ask anything...",
  send: "Send",
  stop: "Stop generating",
  emptyStateTitle: "How can I help with this page?",
  emptyStateWithContext:
    "I can see the page you're viewing. Ask about it, or pick a place to start.",
  emptyStateWithoutContext: "Ask a question, or pick a place to start.",
  composerInputAria: "Message",
  noticeError: "Something went wrong while generating a response.",
  noticeRetry: "Try again",
  noticeBlocked: "This response was blocked by safety filtering.",
  noticeCancelled: "Response cancelled.",
  noticeTruncated: "Response stopped at the model's output limit.",
  noticeConnectionLost: "Connection lost. Reconnect to keep following this response.",
  activityApprovalRequired: "Approval required",
  approvalApprove: "Approve",
  approvalDeny: "Deny",
  approvalApproved: "Approved",
  approvalDenied: "Denied",
  approvalExpired: "Approval expired",
  approvalUnavailable: "This approval is no longer available.",
  activityPreparing: "Preparing the response.",
  activityThinking: "Thinking...",
  activityThoughtProcess: "Thought process",
  activityThoughtForSeconds: (seconds) => `Thought for ${seconds}s`,
  activitySources: (count) => `${count} ${count === 1 ? "source" : "sources"}`,
  conversationNewChat: "New chat",
  conversationSelectChat: "Select chat",
  conversationGenerating: "Generating",
  relativeNow: "Now",
  relativeYesterday: "Yesterday",
  relativeMinutesAgo: (minutes) => `${minutes}m ago`,
  relativeHoursAgo: (hours) => `${hours}h ago`,
  relativeDaysAgo: (days) => `${days}d ago`,
  groupRecent: "Recent",
  groupYesterday: "Yesterday",
  groupPreviousWeek: "Previous 7 days",
  groupPreviousMonth: "Previous 30 days",
  groupOlder: "Older",
  headerRefresh: "Refresh conversation",
  headerSettings: "Settings",
  headerNewChat: "Start new chat",
  headerClose: "Close",
  headerBack: "Back to chat",
  headerSettingsTitle: "Settings",
  headerConversations: "Conversations",
  headerConversationFeed: "Conversation feed",
  dialogClose: "Close dialog",
  linkSafetyTitle: "Open external link?",
  linkSafetyDescription: "You're about to visit an external website.",
  linkSafetyCopy: "Copy link",
  linkSafetyCopied: "Copied",
  linkSafetyOpen: "Open link",
};

/** Merge a caller's overrides over the defaults; an `undefined` field keeps the default. */
export const resolveWidgetLabels = (overrides: SideChatWidgetLabels | undefined): WidgetLabels => {
  if (!overrides) return defaultWidgetLabels;
  const read = <Key extends keyof WidgetLabels>(key: Key): WidgetLabels[Key] =>
    overrides[key] ?? defaultWidgetLabels[key];

  return {
    title: read("title"),
    placeholder: read("placeholder"),
    send: read("send"),
    stop: read("stop"),
    emptyStateTitle: read("emptyStateTitle"),
    emptyStateWithContext: read("emptyStateWithContext"),
    emptyStateWithoutContext: read("emptyStateWithoutContext"),
    composerInputAria: read("composerInputAria"),
    noticeError: read("noticeError"),
    noticeRetry: read("noticeRetry"),
    noticeBlocked: read("noticeBlocked"),
    noticeCancelled: read("noticeCancelled"),
    noticeTruncated: read("noticeTruncated"),
    noticeConnectionLost: read("noticeConnectionLost"),
    activityApprovalRequired: read("activityApprovalRequired"),
    approvalApprove: read("approvalApprove"),
    approvalDeny: read("approvalDeny"),
    approvalApproved: read("approvalApproved"),
    approvalDenied: read("approvalDenied"),
    approvalExpired: read("approvalExpired"),
    approvalUnavailable: read("approvalUnavailable"),
    activityPreparing: read("activityPreparing"),
    activityThinking: read("activityThinking"),
    activityThoughtProcess: read("activityThoughtProcess"),
    activityThoughtForSeconds: read("activityThoughtForSeconds"),
    activitySources: read("activitySources"),
    conversationNewChat: read("conversationNewChat"),
    conversationSelectChat: read("conversationSelectChat"),
    conversationGenerating: read("conversationGenerating"),
    relativeNow: read("relativeNow"),
    relativeYesterday: read("relativeYesterday"),
    relativeMinutesAgo: read("relativeMinutesAgo"),
    relativeHoursAgo: read("relativeHoursAgo"),
    relativeDaysAgo: read("relativeDaysAgo"),
    groupRecent: read("groupRecent"),
    groupYesterday: read("groupYesterday"),
    groupPreviousWeek: read("groupPreviousWeek"),
    groupPreviousMonth: read("groupPreviousMonth"),
    groupOlder: read("groupOlder"),
    headerRefresh: read("headerRefresh"),
    headerSettings: read("headerSettings"),
    headerNewChat: read("headerNewChat"),
    headerClose: read("headerClose"),
    headerBack: read("headerBack"),
    headerSettingsTitle: read("headerSettingsTitle"),
    headerConversations: read("headerConversations"),
    headerConversationFeed: read("headerConversationFeed"),
    dialogClose: read("dialogClose"),
    linkSafetyTitle: read("linkSafetyTitle"),
    linkSafetyDescription: read("linkSafetyDescription"),
    linkSafetyCopy: read("linkSafetyCopy"),
    linkSafetyCopied: read("linkSafetyCopied"),
    linkSafetyOpen: read("linkSafetyOpen"),
  };
};

const WidgetLabelsContext = createContext<WidgetLabels>(defaultWidgetLabels);

export const WidgetLabelsProvider = WidgetLabelsContext.Provider;

// Reads the resolved labels. Outside a provider (standalone shared/ui, showcase, unit
// tests) it returns the built-in defaults, so every leaf renders real copy unwired.
export const useWidgetLabels = (): WidgetLabels => useContext(WidgetLabelsContext);
