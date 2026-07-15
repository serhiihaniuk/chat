import { asRecord, isRecord } from "@side-chat/shared";
import type { SideChatMessageMetadata } from "@side-chat/stream-profile";

import type { WorkflowChatTerminal } from "./use-workflow-widget-chat.js";

export { projectLatestAssistantUsage } from "./projection/assistant-usage-projection.js";

export type WorkflowTimelineMessage = Readonly<{
  readonly id: string;
  readonly role: "system" | "user" | "assistant";
  readonly parts: readonly unknown[];
  readonly metadata?: SideChatMessageMetadata | undefined;
}>;

export type WorkflowTimelineToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "output-available"
  | "output-error"
  | "output-denied";

export type WorkflowTimelineItem =
  | {
      readonly id: string;
      readonly kind: "text";
      readonly role: "user" | "assistant";
      readonly text: string;
      readonly streaming: boolean;
    }
  | {
      readonly id: string;
      readonly kind: "reasoning";
      readonly role: "user" | "assistant";
      readonly text: string;
      readonly streaming: boolean;
    }
  | {
      readonly id: string;
      readonly kind: "tool";
      readonly toolCallId?: string | undefined;
      readonly toolName: string;
      readonly name: string;
      readonly state: WorkflowTimelineToolState;
      readonly approval?:
        | {
            readonly id: string;
            readonly state: "requested" | "approved" | "denied";
          }
        | undefined;
      readonly input?: unknown;
      readonly output?: unknown;
    }
  | {
      readonly id: string;
      readonly kind: "source";
      readonly label: string;
      readonly url?: string | undefined;
    }
  | {
      readonly id: string;
      readonly kind: "file";
      readonly mediaType: string;
      readonly filename?: string | undefined;
      readonly url: string;
    };

/** Project only the native UIMessage parts the workflow branch can render. */
export function projectWorkflowMessageParts(
  message: WorkflowTimelineMessage,
  terminal?: WorkflowChatTerminal,
): readonly WorkflowTimelineItem[] {
  const parts = partsBeforeTerminal(message, terminal);
  const role = message.role === "user" ? "user" : "assistant";
  const projected: WorkflowTimelineItem[] = [];

  for (const [index, part] of parts.entries()) {
    const item = projectPart(part, `${message.id}-${index}`, role);
    if (item) projected.push(item);
  }
  return projected;
}

function partsBeforeTerminal(
  message: WorkflowTimelineMessage,
  terminal: WorkflowChatTerminal | undefined,
): readonly unknown[] {
  if (
    !terminal ||
    terminal.kind === "none" ||
    terminal.messageId !== message.id ||
    terminal.partCount === undefined
  ) {
    return message.parts;
  }
  return message.parts.slice(0, terminal.partCount);
}

function projectPart(
  part: unknown,
  id: string,
  role: "user" | "assistant",
): WorkflowTimelineItem | undefined {
  const nativePart = readNativePart(part);
  if (!nativePart) return undefined;
  const { record, type } = nativePart;

  if (type === "text" || type === "reasoning") {
    const text = readString(record, "text");
    if (text === undefined || text.length === 0) return undefined;
    return {
      id,
      kind: type,
      role,
      text,
      streaming: readString(record, "state") === "streaming",
    };
  }

  if (type === "dynamic-tool" || type.startsWith("tool-")) {
    return projectToolPart(record, id, type);
  }

  if (type === "source-url") {
    return projectSourceUrl(record, id);
  }
  if (type === "source-document") {
    return projectSourceDocument(record, id);
  }
  if (type === "file") {
    return projectFile(record, id);
  }
  if (type === "step-start") return undefined;

  noteUnknownNativePart(type);
  return undefined;
}

function readNativePart(
  part: unknown,
): Readonly<{ record: Readonly<Record<string, unknown>>; type: string }> | undefined {
  const record = asRecord(part);
  const type = readString(record, "type");
  if (record && type) return { record, type };
  noteUnknownNativePart("unknown");
  return undefined;
}

function projectToolPart(
  part: Readonly<Record<string, unknown>>,
  id: string,
  type: string,
): WorkflowTimelineItem | undefined {
  const rawState = readString(part, "state");
  const approval = readApproval(part);
  const state = readToolState(toolStateValue(rawState, approval));
  if (!state) {
    noteUnknownNativePart(`${type}:state`);
    return undefined;
  }
  const toolName = type === "dynamic-tool" ? readString(part, "toolName") : type.slice(5);
  const toolCallId = readString(part, "toolCallId");
  const base = {
    id: toolCallId ? `${id}-tool-${toolCallId}` : id,
    kind: "tool" as const,
    toolName: toolName || "Tool",
    name: humanizeToolName(toolName || "Tool"),
    state,
    input: part["input"],
    output: part["output"],
  };
  return {
    ...base,
    toolCallId,
    approval,
  };
}

function toolStateValue(
  rawState: string | undefined,
  approval: Extract<WorkflowTimelineItem, { kind: "tool" }>["approval"],
): string | undefined {
  if (rawState !== "approval-responded") return rawState;
  if (approval?.state === "approved") return "input-available";
  if (approval?.state === "denied") return "output-denied";
  return undefined;
}

function projectSourceUrl(
  part: Readonly<Record<string, unknown>>,
  id: string,
): WorkflowTimelineItem {
  const url = readString(part, "url");
  const title = readString(part, "title");
  return {
    id,
    kind: "source",
    label: title || url || "Source",
    url,
  };
}

function projectSourceDocument(
  part: Readonly<Record<string, unknown>>,
  id: string,
): WorkflowTimelineItem {
  const title = readString(part, "title");
  const filename = readString(part, "filename");
  return {
    id,
    kind: "source",
    label: title || filename || "Document",
  };
}

function projectFile(
  part: Readonly<Record<string, unknown>>,
  id: string,
): WorkflowTimelineItem | undefined {
  const mediaType = readString(part, "mediaType");
  const url = readString(part, "url");
  if (!mediaType || !url) {
    noteUnknownNativePart("file:invalid");
    return undefined;
  }
  const filename = readString(part, "filename");
  return {
    id,
    kind: "file",
    mediaType,
    url,
    filename,
  };
}

function readToolState(value: unknown): WorkflowTimelineToolState | undefined {
  if (
    value === "input-streaming" ||
    value === "input-available" ||
    value === "approval-requested" ||
    value === "output-available" ||
    value === "output-error" ||
    value === "output-denied"
  ) {
    return value;
  }
  return undefined;
}

function readApproval(
  part: Readonly<Record<string, unknown>>,
): Extract<WorkflowTimelineItem, { kind: "tool" }>["approval"] {
  const approval = asRecord(part["approval"]);
  const id = readString(approval, "id");
  if (!id) return undefined;
  const approved = approval?.["approved"];
  let state: "requested" | "approved" | "denied" = "requested";
  if (approved === true) state = "approved";
  if (approved === false) state = "denied";
  return {
    id,
    state,
  };
}

function humanizeToolName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Tool";
}

function readString(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function noteUnknownNativePart(type: string): void {
  const meta: unknown = import.meta;
  if (!isRecord(meta) || !isRecord(meta["env"]) || meta["env"]["DEV"] !== true) return;
  console.debug(`[side-chat] ignored unknown native UI message part: ${type}`);
}
