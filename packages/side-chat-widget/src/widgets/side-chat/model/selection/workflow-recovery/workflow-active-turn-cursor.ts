import { parseJsonRecord } from "@side-chat/shared";
import { SIDE_CHAT_CLIENT_TOOL_CAPABILITY } from "@side-chat/stream-profile";

/** Minimal identity needed to find one accepted workflow turn after a same-tab refresh. */
export type WorkflowActiveTurnCursor = Readonly<{
  clientToolCapability?: string | undefined;
  conversationId: string;
  runId: string;
  scopeKey: string;
}>;

type CursorStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

/** Read one tab-scoped active-turn cursor, removing malformed state when found. */
export function readWorkflowActiveTurnCursor(
  storageKey: string | undefined,
  scopeKey: string,
  store: CursorStorage | undefined = resolveSessionStorage(),
): WorkflowActiveTurnCursor | undefined {
  if (!storageKey || !store) return undefined;
  try {
    const raw = store.getItem(storageKey);
    if (!raw) return undefined;
    const cursor = parseCursor(raw, scopeKey);
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
  scopeKey: string,
  expectedRunId: string,
  store: CursorStorage | undefined = resolveSessionStorage(),
): void {
  if (!storageKey || !store) return;
  try {
    const cursor = readWorkflowActiveTurnCursor(storageKey, scopeKey, store);
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

function parseCursor(raw: string, expectedScopeKey: string): WorkflowActiveTurnCursor | undefined {
  const value = parseJsonRecord(raw);
  const conversationId = value?.["conversationId"];
  const clientToolCapability = value?.["clientToolCapability"];
  const runId = value?.["runId"];
  const scopeKey = value?.["scopeKey"];
  if (!isNonEmptyString(conversationId) || !isNonEmptyString(runId)) return undefined;
  if (scopeKey !== expectedScopeKey) return undefined;
  if (clientToolCapability === undefined) return { conversationId, runId, scopeKey };
  if (!isClientToolCapability(clientToolCapability)) return undefined;
  return { clientToolCapability, conversationId, runId, scopeKey };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isClientToolCapability(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === SIDE_CHAT_CLIENT_TOOL_CAPABILITY.HEX_LENGTH &&
    /^[0-9a-f]+$/u.test(value)
  );
}
