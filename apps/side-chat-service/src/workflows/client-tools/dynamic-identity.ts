import type { UIMessageChunk } from "ai";

import type { ClientToolDefinition } from "#application/turn/tools/client-tool-catalog";

type DynamicInputDelta = Extract<
  UIMessageChunk,
  { type: "tool-input-delta" }
> & {
  readonly dynamic: true;
};

/**
 * Repair a pinned `@ai-sdk/workflow` v1.0.22 serialization gap that drops the
 * dynamic marker while reconstructing JSON-Schema tools and UI chunks.
 */
export function preserveDynamicClientToolIdentity(
  clientTools: readonly ClientToolDefinition[],
): TransformStream<UIMessageChunk, UIMessageChunk> {
  const clientToolNames = new Set(clientTools.map((tool) => tool.name));
  const clientToolCalls = new Set<string>();

  return new TransformStream({
    transform(chunk, controller) {
      if (isClientToolInputChunk(chunk, clientToolNames)) {
        clientToolCalls.add(chunk.toolCallId);
        controller.enqueue({ ...chunk, dynamic: true });
        return;
      }
      if (
        chunk.type === "tool-input-delta" &&
        clientToolCalls.has(chunk.toolCallId)
      ) {
        const dynamicDelta: DynamicInputDelta = { ...chunk, dynamic: true };
        controller.enqueue(dynamicDelta);
        return;
      }
      if (
        isClientToolOutputChunk(chunk) &&
        clientToolCalls.has(chunk.toolCallId)
      ) {
        controller.enqueue({ ...chunk, dynamic: true });
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

function isClientToolInputChunk(
  chunk: UIMessageChunk,
  clientToolNames: ReadonlySet<string>,
): chunk is Extract<
  UIMessageChunk,
  { type: "tool-input-start" | "tool-input-available" | "tool-input-error" }
> {
  return (
    (chunk.type === "tool-input-start" ||
      chunk.type === "tool-input-available" ||
      chunk.type === "tool-input-error") &&
    clientToolNames.has(chunk.toolName)
  );
}

function isClientToolOutputChunk(
  chunk: UIMessageChunk,
): chunk is Extract<
  UIMessageChunk,
  { type: "tool-output-available" | "tool-output-error" }
> {
  return (
    chunk.type === "tool-output-available" || chunk.type === "tool-output-error"
  );
}
