import {
  ACTIVITY_KINDS,
  ACTIVITY_STATUSES,
  type ActivityDetails,
  type ActivityEvent,
  type ActivityHostCommandDetails,
  type ActivityKind,
  type ActivityStatus,
  type ActivityToolDetails,
  type JsonObject,
  type JsonValue,
} from "@side-chat/chat-protocol";
import { compactJsonObject, optionalField } from "@side-chat/shared";

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
  // activityId is the row id for progress updates. Repeated events with the
  // same id update one row instead of appending duplicate timeline items.
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
    item.status === ACTIVITY_STATUSES.RUNNING
      ? { ...item, status: ACTIVITY_STATUSES.COMPLETED }
      : item,
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
    activeItemId: active?.status === ACTIVITY_STATUSES.RUNNING ? active.id : undefined,
  };
};

export const toJsonObject = (value: Readonly<Record<string, JsonValue | undefined>>): JsonObject =>
  compactJsonObject(value);

const toActivityItem = (event: ActivityEvent): WidgetActivityItem => ({
  id: event.activityId,
  kind: event.activityKind,
  sequence: event.sequence,
  status: event.status,
  title: event.title,
  ...optionalField("body", event.body || undefined),
  ...optionalField("details", event.details),
  createdAt: event.createdAt,
});

const mergeActivityItem = (
  existing: WidgetActivityItem,
  event: ActivityEvent,
): WidgetActivityItem => {
  const wasRunning = existing.status === ACTIVITY_STATUSES.RUNNING;
  const canUpdatePresentation = existing.kind === ACTIVITY_KINDS.REASONING;

  return {
    ...existing,
    ...presentationUpdate(wasRunning && canUpdatePresentation, event),
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
    .filter((item) => item.status === ACTIVITY_STATUSES.RUNNING)
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
    ...optionalField("tool", tool),
    ...optionalField("hostCommand", hostCommand),
  };
};

const mergeToolDetails = (
  existing: ActivityToolDetails | undefined,
  incoming: ActivityToolDetails | undefined,
): ActivityToolDetails | undefined => {
  if (existing && incoming) return { ...existing, ...incoming };
  return incoming ?? existing;
};

const presentationUpdate = (
  canUpdatePresentation: boolean,
  event: ActivityEvent,
): { readonly title?: string; readonly body?: string | undefined } =>
  canUpdatePresentation ? { title: event.title, body: event.body } : {};

const mergeHostCommandDetails = (
  existing: ActivityHostCommandDetails | undefined,
  incoming: ActivityHostCommandDetails | undefined,
): ActivityHostCommandDetails | undefined => {
  if (existing && incoming) return { ...existing, ...incoming };
  return incoming ?? existing;
};
