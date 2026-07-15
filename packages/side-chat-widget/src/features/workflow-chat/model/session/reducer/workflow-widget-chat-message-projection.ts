import type { WorkflowUIMessage } from "#entities/workflow-chat";

export function dedupeWorkflowMessages(
  messages: readonly WorkflowUIMessage[],
): readonly WorkflowUIMessage[] {
  const result: WorkflowUIMessage[] = [];
  const indexes = new Map<string, number>();
  for (const message of messages) {
    const existingIndex = indexes.get(message.id);
    if (existingIndex === undefined) {
      indexes.set(message.id, result.length);
      result.push(message);
    } else {
      const existing = result[existingIndex];
      if (existing) result[existingIndex] = mergeMessageProjection(existing, message);
    }
  }
  return result;
}

export function upsertWorkflowMessage(
  messages: readonly WorkflowUIMessage[],
  incoming: WorkflowUIMessage,
): readonly WorkflowUIMessage[] {
  const index = messages.findIndex((message) => message.id === incoming.id);
  if (index < 0) return [...messages, incoming];
  const existing = messages[index];
  if (!existing) return [...messages, incoming];
  const next = [...messages];
  next[index] = mergeMessageProjection(existing, incoming);
  return next;
}

/** Keep visible content monotonic while a full replay catches up to a newer snapshot. */
function mergeMessageProjection(
  current: WorkflowUIMessage,
  incoming: WorkflowUIMessage,
): WorkflowUIMessage {
  if (current.role !== "assistant" || incoming.role !== "assistant") return incoming;
  if (!isProjectionBehind(current, incoming)) return incoming;
  return {
    ...incoming,
    metadata: incoming.metadata ?? current.metadata,
    parts: current.parts,
  };
}

function isProjectionBehind(current: WorkflowUIMessage, incoming: WorkflowUIMessage): boolean {
  if (incoming.parts.length !== current.parts.length) {
    return incoming.parts.length < current.parts.length;
  }
  return incoming.parts.some((part, index) => {
    const previous = current.parts[index];
    if (!previous || !("text" in part) || !("text" in previous)) return false;
    return part.text.length < previous.text.length;
  });
}
