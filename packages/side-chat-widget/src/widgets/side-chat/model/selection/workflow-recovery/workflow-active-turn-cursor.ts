import { parseJsonRecord } from "@side-chat/shared";

/** Minimal identity needed to find one accepted workflow turn after a same-tab refresh. */
export type WorkflowActiveTurnCursor = Readonly<{
  conversationId: string;
  runId: string;
}>;

type CursorStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

/** Read one tab-scoped active-turn cursor, removing malformed state when found. */
export function readWorkflowActiveTurnCursor(
  storageKey: string | undefined,
  store: CursorStorage | undefined = resolveSessionStorage(),
): WorkflowActiveTurnCursor | undefined {
  if (!storageKey || !store) return undefined;
  try {
    const raw = store.getItem(storageKey);
    if (!raw) return undefined;
    const cursor = parseCursor(raw);
    if (!cursor) store.removeItem(storageKey);
    return cursor;
  } catch {
    return undefined;
  }
}

/** Replace the active-turn cursor after the service accepts a run. */
export function writeWorkflowActiveTurnCursor(
  storageKey: string | undefined,
  cursor: WorkflowActiveTurnCursor,
  store: CursorStorage | undefined = resolveSessionStorage(),
): void {
  if (!storageKey || !store) return;
  try {
    store.setItem(storageKey, JSON.stringify(cursor));
  } catch {
    // Sandboxed or quota-limited hosts may deny storage; chat remains usable.
  }
}

/** Clear a matching run without deleting a newer cursor from the same widget. */
export function clearWorkflowActiveTurnCursor(
  storageKey: string | undefined,
  expectedRunId: string,
  store: CursorStorage | undefined = resolveSessionStorage(),
): void {
  if (!storageKey || !store) return;
  try {
    const cursor = readWorkflowActiveTurnCursor(storageKey, store);
    if (cursor?.runId === expectedRunId) store.removeItem(storageKey);
  } catch {
    // Storage cleanup is best effort; server discovery rejects stale cursors.
  }
}

function resolveSessionStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function parseCursor(raw: string): WorkflowActiveTurnCursor | undefined {
  const value = parseJsonRecord(raw);
  const conversationId = value?.["conversationId"];
  const runId = value?.["runId"];
  if (!isNonEmptyString(conversationId) || !isNonEmptyString(runId)) return undefined;
  return { conversationId, runId };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
