import type {
  ActivityDetails,
  ActivityEvent,
  ActivityHostCommandDetails,
  ActivityKind,
  ActivityStatus,
  ActivityToolDetails,
  JsonObject,
  JsonValue,
} from "@side-chat/chat-protocol";

export type WidgetActivityItem = {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly sequence: number;
  readonly status: ActivityStatus;
  readonly title: string;
  readonly body?: string | undefined;
  readonly details?: ActivityDetails | undefined;
  readonly createdAt: string;
};

export type WidgetActivityTimeline = {
  readonly items: readonly WidgetActivityItem[];
  readonly activeItemId?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
};

export const createEmptyActivityTimeline = (): WidgetActivityTimeline => ({
  items: [],
});

export const applyActivityEvent = (
  timeline: WidgetActivityTimeline,
  event: ActivityEvent,
): WidgetActivityTimeline => {
  const existing = timeline.items.find((item) => item.id === event.activityId);
  const startedAt = timeline.startedAt ?? event.createdAt;

  if (!existing) {
    const inserted = toActivityItem(event);
    const items = sortActivityItems([...timeline.items, inserted]);
    return {
      ...timeline,
      startedAt,
      items,
      activeItemId: readActiveItemId(items),
    };
  }

  const updated = mergeActivityItem(existing, event);
  const items = sortActivityItems(
    timeline.items.map((item) => (item.id === updated.id ? updated : item)),
  );

  return {
    ...timeline,
    startedAt,
    items: sortActivityItems(items),
    activeItemId: readActiveItemId(items),
  };
};

export const completeActivityTimeline = (
  timeline: WidgetActivityTimeline,
  completedAt?: string,
): WidgetActivityTimeline => ({
  ...timeline,
  activeItemId: undefined,
  completedAt: completedAt ?? timeline.completedAt,
  items: timeline.items.map((item) =>
    item.status === "running" ? { ...item, status: "completed" } : item,
  ),
});

export const updateActivityItem = (
  timeline: WidgetActivityTimeline,
  itemId: string,
  update: (item: WidgetActivityItem) => WidgetActivityItem,
): WidgetActivityTimeline => {
  const items = timeline.items.map((item) => (item.id === itemId ? update(item) : item));
  const active = items.find((item) => item.id === timeline.activeItemId);

  return {
    ...timeline,
    items,
    activeItemId: active?.status === "running" ? active.id : undefined,
  };
};

export const toJsonObject = (
  value: Readonly<Record<string, JsonValue | undefined>>,
): JsonObject => {
  const json: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) json[key] = entry;
  }
  return json;
};

const toActivityItem = (event: ActivityEvent): WidgetActivityItem => ({
  id: event.activityId,
  kind: event.activityKind,
  sequence: event.sequence,
  status: event.status,
  title: event.title,
  ...(event.body ? { body: event.body } : {}),
  ...(event.details ? { details: event.details } : {}),
  createdAt: event.createdAt,
});

const mergeActivityItem = (
  existing: WidgetActivityItem,
  event: ActivityEvent,
): WidgetActivityItem => {
  const wasRunning = existing.status === "running";
  const canUpdatePresentation = existing.kind === "reasoning";

  return {
    ...existing,
    ...(wasRunning && canUpdatePresentation ? { title: event.title, body: event.body } : {}),
    status: wasRunning ? event.status : existing.status,
    details: mergeActivityDetails(existing.details, event.details),
  };
};

const sortActivityItems = (items: readonly WidgetActivityItem[]): WidgetActivityItem[] =>
  [...items].sort(
    (left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id),
  );

const readActiveItemId = (items: readonly WidgetActivityItem[]): string | undefined =>
  sortActivityItems(items)
    .filter((item) => item.status === "running")
    .at(-1)?.id;

const mergeActivityDetails = (
  existing: ActivityDetails | undefined,
  incoming: ActivityDetails | undefined,
): ActivityDetails | undefined => {
  if (!incoming) return existing;
  if (!existing) return incoming;

  const tool = mergeToolDetails(existing.tool, incoming.tool);
  const hostCommand = mergeHostCommandDetails(existing.hostCommand, incoming.hostCommand);

  return {
    ...existing,
    ...incoming,
    ...(tool ? { tool } : {}),
    ...(hostCommand ? { hostCommand } : {}),
  };
};

const mergeToolDetails = (
  existing: ActivityToolDetails | undefined,
  incoming: ActivityToolDetails | undefined,
): ActivityToolDetails | undefined => {
  if (existing && incoming) return { ...existing, ...incoming };
  return incoming ?? existing;
};

const mergeHostCommandDetails = (
  existing: ActivityHostCommandDetails | undefined,
  incoming: ActivityHostCommandDetails | undefined,
): ActivityHostCommandDetails | undefined => {
  if (existing && incoming) return { ...existing, ...incoming };
  return incoming ?? existing;
};
