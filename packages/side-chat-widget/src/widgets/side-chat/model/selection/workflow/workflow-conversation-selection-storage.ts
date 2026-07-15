import { parseJsonRecord } from "@side-chat/shared";

type SelectionStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

/** Read the tab-scoped durable conversation selected by this widget instance. */
export function readWorkflowConversationSelection(
  storageKey: string | undefined,
  store: SelectionStorage | undefined = resolveSessionStorage(),
): string | undefined {
  if (!storageKey || !store) return undefined;
  try {
    const raw = store.getItem(storageKey);
    if (!raw) return undefined;
    const conversationId = parseConversationId(raw);
    if (!conversationId) store.removeItem(storageKey);
    return conversationId;
  } catch {
    return undefined;
  }
}

/** Persist view selection only; conversation content and lifecycle remain server-owned. */
export function writeWorkflowConversationSelection(
  storageKey: string | undefined,
  conversationId: string,
  store: SelectionStorage | undefined = resolveSessionStorage(),
): void {
  if (!storageKey || !store) return;
  try {
    store.setItem(storageKey, JSON.stringify({ conversationId }));
  } catch {
    // Sandboxed or quota-limited hosts may deny storage; chat remains usable.
  }
}

/** New chat is an explicit choice and must not restore the previous conversation. */
export function clearWorkflowConversationSelection(
  storageKey: string | undefined,
  store: SelectionStorage | undefined = resolveSessionStorage(),
): void {
  if (!storageKey || !store) return;
  try {
    store.removeItem(storageKey);
  } catch {
    // Storage cleanup is best effort and never blocks local draft creation.
  }
}

function resolveSessionStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function parseConversationId(raw: string): string | undefined {
  const conversationId = parseJsonRecord(raw)?.["conversationId"];
  if (typeof conversationId !== "string" || conversationId.trim().length === 0) return undefined;
  return conversationId;
}
