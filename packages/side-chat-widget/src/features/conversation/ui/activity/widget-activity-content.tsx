import { ACTIVITY_KINDS, ACTIVITY_STATUSES } from "@side-chat/chat-protocol";

import type { RenderActivityItem } from "#entities/activity";
import type { WidgetActivityItem, WidgetMessage } from "#entities/chat";
import type { ToolDetailLevel } from "#entities/settings";
import type { ActivityImageData } from "#shared/ui/activity/activity-images";
import type { CitationSource } from "#shared/ui/activity/citations";
import { hasToolDetail, ToolDetailRow, type ToolDetail } from "#shared/ui/activity/tool-detail";
import type { ReasoningItem } from "#shared/ui/reasoning";
import type { ToolState } from "#shared/ui/tool-row";
import { toProtocolSideChatActivityItem } from "./protocol-activity-item.js";

/**
 * Project a message's activity timeline into reasoning-fold entries.
 *
 * The user's tool-detail level governs tool/host-command items first: "hidden"
 * drops them from the fold entirely (thoughts stay), "name" pins the compact
 * row, and only "full" reaches the default precedence — the host's
 * `renderActivityItem` override, then the expandable detail row (disclosable
 * input/result), then the compact tool row. Non-tool items always consult the
 * override, then render as plain thought lines.
 */
export const toReasoningItems = (
  message: WidgetMessage,
  renderActivityItem: RenderActivityItem | undefined,
  toolDetail: ToolDetailLevel,
): readonly ReasoningItem[] =>
  message.activity.items.flatMap((item) => {
    if (item.kind === ACTIVITY_KINDS.TOOL || item.kind === ACTIVITY_KINDS.HOST_COMMAND) {
      if (toolDetail === "hidden") return [];
      if (toolDetail === "name") return [toCompactToolItem(item)];
    }

    const custom = renderActivityItem?.(toProtocolSideChatActivityItem(item));
    if (custom !== undefined) {
      return [{ kind: "node", id: item.id, node: custom } as const];
    }

    if (item.kind === ACTIVITY_KINDS.TOOL || item.kind === ACTIVITY_KINDS.HOST_COMMAND) {
      return [toToolItem(item)];
    }

    return [{ kind: "thought", id: item.id, text: readThoughtText(item) } as const];
  });

const toToolItem = (item: WidgetActivityItem): ReasoningItem => {
  const detail = toToolDetail(item);

  if (hasToolDetail(detail)) {
    return {
      kind: "node",
      id: item.id,
      node: (
        <ToolDetailRow detail={detail} name={toolDisplayName(item)} state={toToolState(item)} />
      ),
    };
  }

  return toCompactToolItem(item);
};

const toCompactToolItem = (item: WidgetActivityItem): ReasoningItem => ({
  kind: "tool",
  id: item.id,
  name: toolDisplayName(item),
  state: toToolState(item),
});

// Any running tool spins — including one running concurrently behind the active
// timeline row. Success is only shown for an actually completed item.
const toToolState = (item: WidgetActivityItem): ToolState => {
  if (item.status === ACTIVITY_STATUSES.RUNNING) return "running";
  if (item.status === ACTIVITY_STATUSES.FAILED) return "error";
  return "success";
};

const toToolDetail = (item: WidgetActivityItem): ToolDetail => {
  const tool = item.details?.tool;
  if (tool) {
    return { input: tool.input, result: tool.result, errorCode: tool.errorCode };
  }

  const hostCommand = item.details?.hostCommand;
  if (hostCommand) {
    return {
      input: hostCommand.payload,
      result: hostCommand.result,
      statusLine: readHostCommandStatusLine(hostCommand.result),
    };
  }

  return {};
};

// Host commands resolve to `{status, resultCode, ...}`; the card leads with that
// outcome as a `status · resultCode` line, with the payloads behind it.
const readHostCommandStatusLine = (
  result: Readonly<Record<string, unknown>> | undefined,
): string | undefined => {
  if (!result) return undefined;
  const status = typeof result["status"] === "string" ? result["status"] : undefined;
  const resultCode = typeof result["resultCode"] === "string" ? result["resultCode"] : undefined;
  if (status && resultCode) return `${status} · ${resultCode}`;
  return status ?? resultCode;
};

const readThoughtText = (item: WidgetActivityItem): string =>
  item.body ? `${item.title}: ${item.body}` : item.title;

/**
 * Human-readable label for a tool/host-command row.
 *
 * Tool and host-command activities carry the technical name in their details
 * (`open_resource`, `mock_web_search`); the trace shows the humanized form
 * (`Open resource`, `Mock web search`) instead. Falls back to the event title
 * when no structured name is present. A curated catalog label can override this
 * once the tools catalog is wired.
 */
const toolDisplayName = (item: WidgetActivityItem): string => {
  const toolName = item.details?.tool?.toolName ?? item.details?.hostCommand?.commandName;
  return toolName ? humanizeToolName(toolName) : item.title;
};

const humanizeToolName = (name: string): string => {
  const words = name
    .trim()
    .split(/[\s_-]+/u)
    .filter(Boolean);
  if (words.length === 0) return name;
  return words
    .map((word, index) => (index === 0 ? capitalizeWord(word) : word.toLowerCase()))
    .join(" ");
};

const capitalizeWord = (word: string): string =>
  `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;

/**
 * Every source the turn attributed, in stream order, deduplicated by identity
 * (url when present, else label). Sources live either on the activity details
 * root or under the tool details; both feed the message-level sources fold.
 */
export const readMessageSources = (message: WidgetMessage): readonly CitationSource[] => {
  const seen = new Set<string>();
  const sources: CitationSource[] = [];
  for (const item of message.activity.items) {
    const itemSources = [...(item.details?.sources ?? []), ...(item.details?.tool?.sources ?? [])];
    for (const source of itemSources) {
      const key = source.url ?? source.label;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(source);
    }
  }
  return sources;
};

/** Every image the turn produced, in stream order. */
export const readMessageImages = (message: WidgetMessage): readonly ActivityImageData[] =>
  message.activity.items.flatMap((item) => item.details?.images ?? []);
