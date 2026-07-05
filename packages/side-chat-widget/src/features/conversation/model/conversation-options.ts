import type { WidgetLabels } from "#shared/lib/widget-labels";

export type ConversationSummaryView = {
  readonly id: string;
  readonly title: string;
  readonly lastMessageAt?: string | undefined;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// The label shown for the active conversation in the switcher trigger. Falls back to
// the "new chat" label before the first turn establishes a conversation.
export const readActiveConversationTitle = (
  conversations: readonly ConversationSummaryView[],
  selectedConversationId: string | undefined,
  labels: WidgetLabels,
): string => {
  if (!selectedConversationId) return labels.conversationNewChat;
  return (
    conversations.find((conversation) => conversation.id === selectedConversationId)?.title ??
    labels.conversationNewChat
  );
};

// Compact relative timestamp for the conversation lists ("Now", "2h ago",
// "Yesterday", then a locale date). Returns "" when the timestamp is missing/invalid.
export const formatRelativeTime = (iso: string | undefined, labels: WidgetLabels): string => {
  if (!iso) return "";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";

  const elapsed = Date.now() - timestamp;
  if (elapsed < MINUTE_MS) return labels.relativeNow;
  if (elapsed < HOUR_MS) return labels.relativeMinutesAgo(Math.floor(elapsed / MINUTE_MS));
  if (elapsed < DAY_MS) return labels.relativeHoursAgo(Math.floor(elapsed / HOUR_MS));

  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return labels.relativeYesterday;
  if (days < 7) return labels.relativeDaysAgo(days);
  return new Date(timestamp).toLocaleDateString();
};

export type ConversationGroup = {
  readonly id: string;
  readonly label: string;
  readonly conversations: readonly ConversationSummaryView[];
};

// Buckets, newest first, mirroring chat-app session lists. Conversations arrive
// already ordered newest-first, so each one drops into its bucket in order. Bucket
// labels come from the widget labels; per-item relative time is shown separately.
const GROUP_DEFINITIONS: readonly {
  readonly id: string;
  readonly maxAgeDays: number;
}[] = [
  { id: "recent", maxAgeDays: 0 },
  { id: "yesterday", maxAgeDays: 1 },
  { id: "week", maxAgeDays: 7 },
  { id: "month", maxAgeDays: 30 },
  { id: "older", maxAgeDays: Number.POSITIVE_INFINITY },
];

const groupLabelFor = (id: string, labels: WidgetLabels): string => {
  const byId: Record<string, string> = {
    recent: labels.groupRecent,
    yesterday: labels.groupYesterday,
    week: labels.groupPreviousWeek,
    month: labels.groupPreviousMonth,
    older: labels.groupOlder,
  };
  return byId[id] ?? id;
};

export const groupConversationsByDate = (
  conversations: readonly ConversationSummaryView[],
  labels: WidgetLabels,
): readonly ConversationGroup[] => {
  const todayStart = startOfToday();
  const buckets = new Map<string, ConversationSummaryView[]>(
    GROUP_DEFINITIONS.map((group) => [group.id, []]),
  );

  for (const conversation of conversations) {
    buckets.get(groupIdForConversation(conversation, todayStart))?.push(conversation);
  }

  return GROUP_DEFINITIONS.flatMap((group) => {
    const items = buckets.get(group.id) ?? [];
    return items.length === 0
      ? []
      : [{ id: group.id, label: groupLabelFor(group.id, labels), conversations: items }];
  });
};

const startOfToday = (): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
};

// Whole-day age relative to local midnight (0 = today, 1 = yesterday, ...).
const groupIdForConversation = (
  conversation: ConversationSummaryView,
  todayStart: number,
): string => {
  const timestamp = Date.parse(conversation.lastMessageAt ?? "");
  if (!Number.isFinite(timestamp)) return "older";
  const conversationDay = new Date(timestamp);
  conversationDay.setHours(0, 0, 0, 0);
  const ageDays = Math.round((todayStart - conversationDay.getTime()) / DAY_MS);
  return GROUP_DEFINITIONS.find((group) => ageDays <= group.maxAgeDays)?.id ?? "older";
};
