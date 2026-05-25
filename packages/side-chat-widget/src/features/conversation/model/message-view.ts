import type { JsonObject } from "@side-chat/chat-protocol";

import type {
  WidgetHostCommandPart,
  WidgetMessage,
  WidgetMessagePart,
  WidgetToolPart,
} from "#entities/message/model";
import { isUnknownRecord, readString } from "#shared/lib/unknown-record";

export type MessageAttachment = {
  readonly id: string;
  readonly mediaType?: string;
  readonly name: string;
  readonly size?: number;
  readonly url: string;
};

export type CitationSource = {
  readonly dataset?: string;
  readonly label: string;
  readonly resourceId?: string;
  readonly sourceId: string;
};

export type AssistantMessageView = {
  readonly attachments: readonly MessageAttachment[];
  readonly content: string;
  readonly hostCommandParts: readonly WidgetHostCommandPart[];
  readonly reasoningParts: readonly WidgetMessagePart[];
  readonly sources: readonly CitationSource[];
  readonly toolParts: readonly WidgetToolPart[];
};

export const getAssistantMessageView = (
  message: WidgetMessage,
): AssistantMessageView => {
  const parts = message.parts ?? [];
  const tools = parts.filter(isToolPart);
  const metadata = message.metadata;

  return {
    attachments: mergeAttachments([
      ...readAttachments(metadata),
      ...tools.flatMap(readToolAttachment),
    ]),
    content: stripCitationMetadata(message.content),
    hostCommandParts: parts.filter(isHostCommandPart),
    reasoningParts: parts.filter((part) => part.type === "reasoning"),
    sources: mergeSources([
      ...readCitationMetadata(message.content),
      ...readSources(metadata),
      ...tools.flatMap((tool) => readSources(tool.output)),
    ]),
    toolParts: tools,
  };
};

export const toolDisplayNames: Record<string, string> = {
  data_lookup: "Data lookup",
  generate_report: "Report",
  host_command: "Host command",
  lookup: "Lookup",
};

const isToolPart = (part: WidgetMessagePart): part is WidgetToolPart =>
  part.type === "tool";

const isHostCommandPart = (
  part: WidgetMessagePart,
): part is WidgetHostCommandPart => part.type === "host-command";

const readToolAttachment = (
  tool: WidgetToolPart,
): readonly MessageAttachment[] => {
  if (tool.status !== "completed" || !tool.output) return [];
  const reportUrl = readString(tool.output, "reportUrl");
  if (!reportUrl) return readAttachments(tool.output);
  return [
    {
      id: tool.toolCallId,
      mediaType: "application/pdf",
      name: readString(tool.output, "title") ?? "Generated report",
      url: reportUrl,
    },
  ];
};

const readAttachments = (
  metadata: JsonObject | undefined,
): readonly MessageAttachment[] => {
  const attachments = metadata?.["attachments"];
  if (!Array.isArray(attachments)) return [];
  return attachments.filter(isAttachment);
};

const isAttachment = (value: unknown): value is MessageAttachment => {
  if (!isUnknownRecord(value)) return false;
  return Boolean(
    readString(value, "id") &&
    readString(value, "name") &&
    readString(value, "url"),
  );
};

const readSources = (
  metadata: JsonObject | undefined,
): readonly CitationSource[] => {
  const sources = metadata?.["sources"];
  if (!Array.isArray(sources)) return [];
  return sources.filter(isSource);
};

const isSource = (value: unknown): value is CitationSource => {
  if (!isUnknownRecord(value)) return false;
  return Boolean(readString(value, "sourceId") && readString(value, "label"));
};

const mergeAttachments = (
  attachments: readonly MessageAttachment[],
): readonly MessageAttachment[] => {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = `${attachment.url}:${attachment.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mergeSources = (
  sources: readonly CitationSource[],
): readonly CitationSource[] => {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.sourceId)) return false;
    seen.add(source.sourceId);
    return true;
  });
};

const citationMetadataPattern =
  /\n*\s*<!-- sidechat-citations:([^]*?) -->\s*$/u;

const stripCitationMetadata = (content: string): string =>
  content.replace(citationMetadataPattern, "").trim();

const readCitationMetadata = (content: string): readonly CitationSource[] => {
  const match = citationMetadataPattern.exec(content);
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSource);
  } catch {
    return [];
  }
};

export const getVisibleContextCharacters = (
  messages: readonly WidgetMessage[],
): number =>
  Math.min(
    messages
      .slice(-12)
      .reduce(
        (total, message) => total + Math.min(message.content.length, 1200),
        0,
      ),
    6000,
  );
