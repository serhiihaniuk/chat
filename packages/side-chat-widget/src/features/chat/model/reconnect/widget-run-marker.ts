import { isRecord } from "@side-chat/shared";

/**
 * Lightweight pointer to a live run, persisted so a full reload can recover it.
 *
 * Only identity is stored — never message content or a cursor — because the
 * the owning instance's buffered stream is the live source of truth, and a cold
 * recovery attempts replay from the start (`after = -1`). If that buffer is
 * unavailable, the controller polls durable status and falls back to terminal
 * history. The marker survives transport failure so a reload can try both paths.
 */
export type WidgetActiveRunMarker = {
  readonly requestId: string;
  readonly assistantTurnId?: string | undefined;
  readonly conversationId?: string | undefined;
};

const STORAGE_SUFFIX = ":active-run";

const markerStorageKey = (conversationStorageKey: string | undefined): string | undefined =>
  conversationStorageKey ? `${conversationStorageKey}${STORAGE_SUFFIX}` : undefined;

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    // Access can throw in sandboxed iframes; treat as unavailable, not fatal.
    return undefined;
  }
};

/** Read the persisted active-run marker, or undefined when absent/malformed. */
export const readActiveRunMarker = (
  conversationStorageKey: string | undefined,
): WidgetActiveRunMarker | undefined => {
  const key = markerStorageKey(conversationStorageKey);
  const store = storage();
  if (!key || !store) return undefined;

  const raw = store.getItem(key);
  if (!raw) return undefined;

  return parseMarker(raw);
};

/** Persist (or update) the active-run marker for this widget instance. */
export const writeActiveRunMarker = (
  conversationStorageKey: string | undefined,
  marker: WidgetActiveRunMarker,
): void => {
  const key = markerStorageKey(conversationStorageKey);
  const store = storage();
  if (!key || !store) return;

  store.setItem(key, JSON.stringify(marker));
};

/** Remove the marker once a run is terminal or abandoned. */
export const clearActiveRunMarker = (conversationStorageKey: string | undefined): void => {
  const key = markerStorageKey(conversationStorageKey);
  const store = storage();
  if (!key || !store) return;

  store.removeItem(key);
};

const parseMarker = (raw: string): WidgetActiveRunMarker | undefined => {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value["requestId"] !== "string") return undefined;
    return {
      requestId: value["requestId"],
      assistantTurnId: optionalString(value["assistantTurnId"]),
      conversationId: optionalString(value["conversationId"]),
    };
  } catch {
    return undefined;
  }
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
