export type ConversationSummaryView = {
  readonly id: string;
  readonly title: string;
  readonly lastMessageAt?: string | undefined;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// The label shown for the active conversation in the switcher trigger. Falls back to
// "New chat" before the first turn establishes a conversation.
export const readActiveConversationTitle = (
  conversations: readonly ConversationSummaryView[],
  selectedConversationId: string | undefined,
): string => {
  if (!selectedConversationId) return "New chat";
  return (
    conversations.find((conversation) => conversation.id === selectedConversationId)?.title ??
    "New chat"
  );
};

// Compact relative timestamp for the conversation lists ("Now", "2h ago",
// "Yesterday", then a date). Returns "" when the timestamp is missing or invalid.
export const formatRelativeTime = (iso: string | undefined): string => {
  if (!iso) return "";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";

  const elapsed = Date.now() - timestamp;
  if (elapsed < MINUTE_MS) return "Now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;

  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

export type ConversationGroup = {
  readonly id: string;
  readonly label: string;
  readonly conversations: readonly ConversationSummaryView[];
};

// Buckets, newest first, mirroring chat-app session lists. Conversations arrive
// already ordered newest-first, so each one drops into its bucket in order. The most
// recent bucket stays labelled "Recent"; per-item relative time is shown separately.
const GROUP_DEFINITIONS: readonly {
  readonly id: string;
  readonly label: string;
  readonly maxAgeDays: number;
}[] = [
  { id: "recent", label: "Recent", maxAgeDays: 0 },
  { id: "yesterday", label: "Yesterday", maxAgeDays: 1 },
  { id: "week", label: "Previous 7 days", maxAgeDays: 7 },
  { id: "month", label: "Previous 30 days", maxAgeDays: 30 },
  { id: "older", label: "Older", maxAgeDays: Number.POSITIVE_INFINITY },
];

export const groupConversationsByDate = (
  conversations: readonly ConversationSummaryView[],
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
    return items.length === 0 ? [] : [{ id: group.id, label: group.label, conversations: items }];
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
