import { getWritable } from "workflow";

import type { ToolApprovalInput } from "#application/ports/turn/tools/tool-approval-store";
import type {
  ServerToolDefinition,
  ServerToolSource,
} from "#application/turn/tools/server-tools/server-tool-catalog";
import {
  isDeniedToolOutput,
  type ToolApprovalDenialOutput,
} from "../tool-approvals/approval-output.js";
import type { ChatTurnJournalPart } from "../journal/chat-turn-journal.js";

const MAX_SOURCE_LABEL_LENGTH = 256;
const MAX_SOURCE_URL_LENGTH = 2_048;

/** Read URLs only from a successful tool result; denial payloads never become sources. */
export function readServerToolSources<Input extends ToolApprovalInput, Output>(
  definition: ServerToolDefinition<Input, Output>,
  output: Output | ToolApprovalDenialOutput,
): readonly ServerToolSource[] {
  if (isDeniedToolOutput(output)) return [];
  return (definition.readSources?.(output) ?? []).flatMap((source) => {
    const safeSource = readSafeServerToolSource(source);
    return safeSource ? [safeSource] : [];
  });
}

/** Append already-projected sources from a workflow step, where stream writes are legal. */
export async function writeServerToolSources(
  sources: readonly ServerToolSource[],
  toolCallId: string,
): Promise<void> {
  "use step";

  const writable = getWritable<ChatTurnJournalPart>();
  const writer = writable.getWriter();
  try {
    for (const [index, source] of sources.entries()) {
      await writer.write(toModelSourcePart(source, toolCallId, index));
    }
  } finally {
    writer.releaseLock();
  }
}

function toModelSourcePart(source: ServerToolSource, toolCallId: string, index: number) {
  return {
    type: "source" as const,
    sourceType: "url" as const,
    id: `${toolCallId}:source:${index + 1}`,
    url: source.url,
    title: source.label,
  };
}

/** Keep model-authored source metadata bounded and safe before it reaches history. */
function readSafeServerToolSource(source: ServerToolSource): ServerToolSource | undefined {
  const label = source.label.trim();
  const url = source.url.trim();
  if (
    label.length === 0 ||
    label.length > MAX_SOURCE_LABEL_LENGTH ||
    url.length === 0 ||
    url.length > MAX_SOURCE_URL_LENGTH ||
    label !== source.label ||
    url !== source.url
  ) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined;
    return { label, url };
  } catch {
    return undefined;
  }
}
