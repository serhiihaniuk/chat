import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Bot,
  Copy,
  FileText,
  Globe2,
  ListChecks,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCcw,
  Settings,
  Trophy,
  Send,
  X,
} from "lucide-react";
import type {
  HostCommand,
  HostCommandResult,
  HostContextSnapshot,
  ModelSelection,
  TokenUsage,
} from "@side-chat/shared-protocol";
import {
  Attachment,
  AttachmentAction,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  type AttachmentData,
} from "./components/ai-elements/attachments.js";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from "./components/ai-elements/context.js";
import {
  Citations,
  type CitationSource,
} from "./components/ai-elements/citation.js";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  ConversationScrollToBottomSignal,
} from "./components/ai-elements/conversation.js";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "./components/ai-elements/message.js";
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./components/ai-elements/prompt-input.js";
import { Reasoning } from "./components/ai-elements/reasoning.js";
import {
  Suggestion,
  Suggestions,
} from "./components/ai-elements/suggestion.js";
import { Tool } from "./components/ai-elements/tool.js";
import { useSideChat, type SideChatError } from "./hooks/use-side-chat.js";

export type SideChatTransport = {
  streamUrl: string;
  historyUrl?: string;
  usageUrl?: string;
  protocol?: "sidechat.v1";
};

export type SideChatIdentity = {
  workspaceId: string;
  userId?: string;
  conversationId?: string;
};

export type SideChatHostBridge = {
  getContext?: () =>
    | HostContextSnapshot
    | undefined
    | Promise<HostContextSnapshot | undefined>;
  dispatchCommand?: (
    command: HostCommand,
  ) => HostCommandResult | Promise<HostCommandResult>;
};

type SideChatWidgetBaseProps = {
  initialConversationId?: string;
  historyEndpoint?: string;
  host?: SideChatHostBridge;
  title?: string;
  placeholder?: string;
  defaultModel?: ModelSelection;
  availableModels?: ModelSelection[];
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: SideChatError) => void;
  onUsage?: (usage: TokenUsage) => void;
};

export type SideChatWidgetProps = SideChatWidgetBaseProps &
  (
    | {
        apiEndpoint: string;
        workspaceId: string;
        transport?: SideChatTransport;
        identity?: SideChatIdentity;
      }
    | {
        transport: SideChatTransport;
        identity: SideChatIdentity;
        apiEndpoint?: string;
        workspaceId?: string;
      }
  );

const fallbackModel: ModelSelection = {
  provider: "openai",
  id: "gpt-5.4-nano",
  reasoningEffort: "high",
};
const defaultModelAliasId = "gpt-5.5";
const modelAliasOptions = [
  {
    id: defaultModelAliasId,
    label: "GPT 5.5",
    description: "Current model in a nicer jacket",
  },
  {
    id: "gpt-6.0",
    label: "GPT 6.0",
    description: "Absolutely not suspiciously early",
  },
  {
    id: "claude-mythos",
    label: "Claude Mythos",
    description: "Probably remembers the first spreadsheet",
  },
  {
    id: "claude-mythos-2",
    label: "Claude Mythos 2",
    description: "Now with twice the folklore",
  },
] as const;
const panelId = "side-chat-widget-panel";
const defaultPanelWidth = 600;
const minPanelSize = { width: 560, height: 560 };
const viewportGutter = 32;
const panelInset = 20;
const panelDragGutter = 12;
const defaultPanelHeightRatio = 0.75;
const recentContextMessageLimit = 12;
const recentContextMessageCharacters = 1200;
const recentContextTotalCharacters = 6000;
const appearanceStorageKey = "sidechat.appearancePreset";

const appearancePresets = [
  {
    id: "ubs",
    label: "UBS",
    accent: "#e60000",
    background: "#ffffff",
    foreground: "#0f172a",
    surface: "#f8fafc",
    border: "#e2e8f0",
  },
  {
    id: "vercel",
    label: "Vercel",
    accent: "#006efe",
    background: "#ffffff",
    foreground: "#111827",
    surface: "#f3f4f6",
    border: "#d1d5db",
  },
  {
    id: "emerald",
    label: "Emerald",
    accent: "#059669",
    background: "#fbfdfb",
    foreground: "#10231b",
    surface: "#ecfdf5",
    border: "#c7e5d5",
  },
] as const;

type AppearancePresetId = (typeof appearancePresets)[number]["id"];

const defaultAppearancePresetId: AppearancePresetId = "emerald";

const isAppearancePresetId = (value: string): value is AppearancePresetId =>
  appearancePresets.some((preset) => preset.id === value);

const toolDisplayNames: Record<string, string> = {
  workbench_query: "Workbench data lookup",
  workbench_surface_context: "Current table context",
  generate_workbench_report: "PDF report",
};

type WidgetMessagePart = NonNullable<
  ReturnType<typeof useSideChat>["messages"][number]["parts"]
>[number];

type WidgetToolPart = Extract<WidgetMessagePart, { type: "tool" }>;
type WidgetHostCommandPart = Extract<
  WidgetMessagePart,
  { type: "host-command" }
>;

const getHostCommandToolStatus = (
  part: WidgetHostCommandPart,
): "running" | "completed" | "error" => {
  if (part.status === "pending") return "running";
  if (part.status === "applied") return "completed";
  return "error";
};

const getDefaultPanelSize = () =>
  clampPanelSize({
    width: defaultPanelWidth,
    height:
      typeof window === "undefined"
        ? 840
        : Math.round(window.innerHeight * defaultPanelHeightRatio),
  });

type ResizeHandle =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right";

type PanelOffset = { x: number; y: number };

function clampPanelSize(size: { width: number; height: number }) {
  const maxWidth =
    typeof window === "undefined"
      ? defaultPanelWidth
      : window.innerWidth - viewportGutter;
  const maxHeight =
    typeof window === "undefined"
      ? 840
      : window.innerHeight - viewportGutter;

  return {
    width: Math.min(Math.max(size.width, minPanelSize.width), maxWidth),
    height: Math.min(Math.max(size.height, minPanelSize.height), maxHeight),
  };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const handleResizesFromLeft = (handle: ResizeHandle) =>
  handle === "left" || handle === "top-left";

const handleResizesFromRight = (handle: ResizeHandle) =>
  handle === "right" || handle === "top-right";

const handleResizesFromTop = (handle: ResizeHandle) =>
  handle === "top" || handle === "top-left" || handle === "top-right";

const handleResizesFromBottom = (handle: ResizeHandle) => handle === "bottom";

const getResizeCursor = (handle: ResizeHandle) =>
  handle === "top-left" || handle === "top-right"
    ? handle === "top-left"
      ? "nwse-resize"
      : "nesw-resize"
    : handle === "top" || handle === "bottom"
      ? "ns-resize"
      : "ew-resize";

const getPanelAnchorPosition = (size: { width: number; height: number }) => {
  if (typeof window === "undefined") return { left: 0, top: 0 };

  return {
    left: window.innerWidth - panelInset - size.width,
    top: window.innerHeight - panelInset - size.height,
  };
};

const clampPanelOffset = (
  offset: PanelOffset,
  size: { width: number; height: number },
) => {
  if (typeof window === "undefined") return offset;

  const anchor = getPanelAnchorPosition(size);
  const maxLeft = Math.max(
    panelDragGutter,
    window.innerWidth - size.width - panelDragGutter,
  );
  const maxTop = Math.max(
    panelDragGutter,
    window.innerHeight - size.height - panelDragGutter,
  );
  const left = clamp(
    anchor.left + offset.x,
    panelDragGutter,
    maxLeft,
  );
  const top = clamp(
    anchor.top + offset.y,
    panelDragGutter,
    maxTop,
  );

  return {
    x: left - anchor.left,
    y: top - anchor.top,
  };
};

const getVisibleContextCharacters = (
  messages: Array<{ role: string; content: string }>,
) => {
  const formattedLength = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-recentContextMessageLimit)
    .reduce((total, message) => {
      const normalized = message.content.replace(/\s+/g, " ").trim();
      return (
        total +
        message.role.length +
        2 +
        Math.min(normalized.length, recentContextMessageCharacters)
      );
    }, 0);

  return Math.min(formattedLength, recentContextTotalCharacters);
};

const readStringField = (value: unknown, field: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
};

const resolveArtifactUrl = (url: string, baseUrl: string) => {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
};

const getReportAttachment = (
  tool: WidgetToolPart,
  apiEndpoint: string,
): AttachmentData | undefined => {
  if (tool.toolName !== "generate_workbench_report" || tool.status !== "completed") {
    return undefined;
  }

  const reportUrl = readStringField(tool.output, "reportUrl");
  if (!reportUrl) return undefined;

  const title = readStringField(tool.output, "title");
  const fileName = readStringField(tool.output, "fileName");
  const resolvedUrl = resolveArtifactUrl(reportUrl, apiEndpoint);

  return {
    id: tool.toolCallId,
    name: title ? `${title}.pdf` : fileName ?? "Workbench report.pdf",
    url: resolvedUrl,
    mediaType: "application/pdf",
  };
};

const getMessageAttachments = (
  parts: WidgetMessagePart[],
  apiEndpoint: string,
) =>
  parts
    .filter(isToolPart)
    ?.map((tool) => getReportAttachment(tool, apiEndpoint))
    .filter((attachment): attachment is AttachmentData => Boolean(attachment)) ??
  [];

const isAttachmentData = (value: unknown): value is AttachmentData => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const attachment = value as Record<string, unknown>;
  return (
    typeof attachment.id === "string" &&
    typeof attachment.name === "string" &&
    typeof attachment.url === "string" &&
    (attachment.mediaType === undefined ||
      typeof attachment.mediaType === "string") &&
    (attachment.size === undefined || typeof attachment.size === "number")
  );
};

export const getMetadataAttachments = (
  metadata: Record<string, unknown> | undefined,
  apiEndpoint: string,
): AttachmentData[] => {
  const attachments = metadata?.attachments;
  return Array.isArray(attachments)
    ? attachments.filter(isAttachmentData).map((attachment) => ({
        ...attachment,
        url: resolveArtifactUrl(attachment.url, apiEndpoint),
      }))
    : [];
};

const isToolPart = (
  part: WidgetMessagePart,
): part is Extract<WidgetMessagePart, { type: "tool" }> =>
  part.type === "tool";

const isCitationSource = (value: unknown): value is CitationSource => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const source = value as Record<string, unknown>;
  return (
    typeof source.sourceId === "string" &&
    typeof source.label === "string" &&
    typeof source.dataset === "string" &&
    (source.resourceId === undefined || typeof source.resourceId === "string") &&
    (source.rowId === undefined || typeof source.rowId === "string") &&
    (source.field === undefined || typeof source.field === "string")
  );
};

const getToolSources = (output: unknown): CitationSource[] => {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return [];
  }

  const sources = (output as { sources?: unknown }).sources;
  return Array.isArray(sources) ? sources.filter(isCitationSource) : [];
};

const citationMetadataPattern =
  /\n*\s*<!-- sidechat-citations:([^]*?) -->\s*$/;

const normalizeCitationText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getSourceSearchTerms = (source: CitationSource) => {
  const labelTail = source.label.split("·").at(-1)?.trim();
  return [labelTail, source.rowId, source.field]
    .filter((term): term is string => Boolean(term && term.length > 2))
    .map(normalizeCitationText);
};

const maxMatchedCitationSources = 2;

const knownWorkbenchSources: CitationSource[] = [
  {
    sourceId: "client_portfolio_review:review-ackermann-family-office",
    label: "Client Portfolio Review · Ackermann Family Office",
    dataset: "client_portfolio_review",
    rowId: "review-ackermann-family-office",
  },
  {
    sourceId: "client_portfolio_review:review-bauhaus-enterprises-ag",
    label: "Client Portfolio Review · Bauhaus Enterprises AG",
    dataset: "client_portfolio_review",
    rowId: "review-bauhaus-enterprises-ag",
  },
  {
    sourceId: "client_portfolio_review:review-chen-private-wealth",
    label: "Client Portfolio Review · Chen Private Wealth",
    dataset: "client_portfolio_review",
    rowId: "review-chen-private-wealth",
  },
  {
    sourceId: "top_risk_accounts:risk-global-medtech-liquidity-gap",
    label: "Top Risk Accounts · Global MedTech Inc.",
    dataset: "top_risk_accounts",
    rowId: "risk-global-medtech-liquidity-gap",
  },
  {
    sourceId: "top_risk_accounts:risk-jasper-retail-credit-concentration",
    label: "Top Risk Accounts · Jasper Retail Group",
    dataset: "top_risk_accounts",
    rowId: "risk-jasper-retail-credit-concentration",
  },
];

export const inferInlineSourcesFromContent = (content: string) => {
  const normalizedContent = normalizeCitationText(content);
  const mentionsTopRisk = normalizedContent.includes("top risk");
  const mentionsClientReview = normalizedContent.includes("client portfolio");
  const inferred = knownWorkbenchSources.filter((source) => {
    const rowMentioned = getSourceSearchTerms(source).some((term) =>
      normalizedContent.includes(term),
    );
    if (!rowMentioned) return false;
    if (source.dataset === "top_risk_accounts") {
      return mentionsTopRisk || normalizedContent.includes("high priority");
    }
    if (source.dataset === "client_portfolio_review") {
      return mentionsClientReview || !mentionsTopRisk;
    }
    return true;
  });

  return inferred.slice(0, maxMatchedCitationSources);
};

export const selectInlineSources = (
  content: string,
  sources: CitationSource[],
) => {
  const uniqueSources = Array.from(
    new Map(sources.map((source) => [source.sourceId, source])).values(),
  );
  if (uniqueSources.length <= 1) return uniqueSources;

  const normalizedContent = normalizeCitationText(content);
  const matchedSources = uniqueSources.filter((source) =>
    getSourceSearchTerms(source).some((term) => normalizedContent.includes(term)),
  );

  return matchedSources.length > 0
    ? matchedSources.slice(0, maxMatchedCitationSources)
    : uniqueSources.slice(0, 1);
};

export const parseCitationMetadata = (content: string) => {
  const match = content.match(citationMetadataPattern);
  if (!match) return { content, sources: [] as CitationSource[] };

  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    const sources = Array.isArray(parsed) ? parsed.filter(isCitationSource) : [];
    return {
      content: content.replace(citationMetadataPattern, "").trimEnd(),
      sources,
    };
  } catch {
    return { content: content.replace(citationMetadataPattern, "").trimEnd(), sources: [] };
  }
};

const getMetadataSources = (
  metadata: Record<string, unknown> | undefined,
): CitationSource[] => {
  const citations = metadata?.citations;
  return Array.isArray(citations) ? citations.filter(isCitationSource) : [];
};

const getAssistantParts = (
  message: ReturnType<typeof useSideChat>["messages"][number],
) => message.parts ?? [];

const cleanReportResponseText = (content: string, hasAttachments: boolean) => {
  if (!hasAttachments) return content;

  return content
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return (
        !normalized.startsWith("download:") &&
        !normalized.startsWith("download/preview:") &&
        !/\/reports\/[0-9a-f-]+\.pdf/i.test(line)
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export function SideChatWidget(props: SideChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [panelSize, setPanelSize] = useState(getDefaultPanelSize);
  const [panelOffset, setPanelOffset] = useState<PanelOffset>({ x: 0, y: 0 });
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedModelAliasId, setSelectedModelAliasId] =
    useState(defaultModelAliasId);
  const [appearancePresetId, setAppearancePresetId] =
    useState<AppearancePresetId>(defaultAppearancePresetId);
  const [scrollToBottomSignal, setScrollToBottomSignal] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const restoreLauncherFocus = useRef(false);
  const panelOffsetRef = useRef(panelOffset);
  const resizeRef = useRef<{
    handle: ResizeHandle;
    startOffset: PanelOffset;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const dragRef = useRef<{
    anchorLeft: number;
    anchorTop: number;
    height: number;
    startLeft: number;
    startTop: number;
    startX: number;
    startY: number;
    width: number;
  } | null>(null);
  const models = useMemo(
    () =>
      props.availableModels?.length ? props.availableModels : [fallbackModel],
    [props.availableModels],
  );
  const apiEndpoint =
    props.transport?.streamUrl ??
    ("apiEndpoint" in props ? props.apiEndpoint : undefined) ??
    "";
  const workspaceId =
    props.identity?.workspaceId ??
    ("workspaceId" in props ? props.workspaceId : undefined) ??
    "";
  const initialConversationId =
    props.identity?.conversationId ?? props.initialConversationId;
  const historyEndpoint = props.transport?.historyUrl ?? props.historyEndpoint;
  const chat = useSideChat({
    apiEndpoint,
    workspaceId,
    initialConversationId,
    historyEndpoint,
    defaultModel: props.defaultModel ?? models[0],
    getHostContext: props.host?.getContext,
    dispatchHostCommand: props.host?.dispatchCommand,
    onError: props.onError,
    onUsage: props.onUsage,
  });

  const selectModelAlias = (aliasId: string) => {
    const nextAlias = modelAliasOptions.some((option) => option.id === aliasId)
      ? aliasId
      : defaultModelAliasId;
    setSelectedModelAliasId(nextAlias);
    chat.setModel(models[0]);
  };

  const canSend = draft.trim().length > 0 && !chat.isStreaming;
  const visibleContextCharacters = getVisibleContextCharacters(chat.messages);
  const appearancePreset =
    appearancePresets.find((preset) => preset.id === appearancePresetId) ??
    appearancePresets[0];
  const appearanceVars = {
    "--sidechat-accent": appearancePreset.accent,
    "--sidechat-bg": appearancePreset.background,
    "--sidechat-fg": appearancePreset.foreground,
    "--sidechat-surface": appearancePreset.surface,
    "--sidechat-border": appearancePreset.border,
  } as React.CSSProperties;

  useEffect(() => {
    panelOffsetRef.current = panelOffset;
  }, [panelOffset]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }

    if (restoreLauncherFocus.current) {
      launcherButtonRef.current?.focus({ preventScroll: true });
      restoreLauncherFocus.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setPanelSize((current) => clampPanelSize(current));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    setPanelOffset((current) => clampPanelOffset(current, panelSize));
  }, [open, panelSize]);

  useEffect(() => {
    if (!open) setAppearanceOpen(false);
  }, [open]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(appearanceStorageKey);
      if (stored && isAppearancePresetId(stored)) {
        setAppearancePresetId(stored);
      }
    } catch {
      // Appearance persistence is optional; ignore unavailable storage.
    }
  }, []);

  const selectAppearancePreset = (presetId: AppearancePresetId) => {
    setAppearancePresetId(presetId);
    setAppearanceOpen(false);
    try {
      window.localStorage.setItem(appearanceStorageKey, presetId);
    } catch {
      // Appearance persistence is optional; ignore unavailable storage.
    }
  };

  const resetAppearancePreset = () => {
    setAppearancePresetId(defaultAppearancePresetId);
    setAppearanceOpen(false);
    try {
      window.localStorage.removeItem(appearanceStorageKey);
    } catch {
      // Appearance persistence is optional; ignore unavailable storage.
    }
  };

  useEffect(() => {
    const resizePanel = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;

      const nextWidth =
        handleResizesFromLeft(resize.handle)
          ? resize.startWidth + resize.startX - event.clientX
          : handleResizesFromRight(resize.handle)
            ? resize.startWidth + event.clientX - resize.startX
            : resize.startWidth;
      const nextHeight = handleResizesFromTop(resize.handle)
        ? resize.startHeight + resize.startY - event.clientY
        : handleResizesFromBottom(resize.handle)
          ? resize.startHeight + event.clientY - resize.startY
          : resize.startHeight;

      const nextSize = clampPanelSize({
        width: nextWidth,
        height: nextHeight,
      });
      const nextOffset = {
        ...resize.startOffset,
        x: handleResizesFromRight(resize.handle)
          ? resize.startOffset.x + nextSize.width - resize.startWidth
          : resize.startOffset.x,
        y: handleResizesFromBottom(resize.handle)
          ? resize.startOffset.y + nextSize.height - resize.startHeight
          : resize.startOffset.y,
      };

      setPanelSize(nextSize);
      setPanelOffset(clampPanelOffset(nextOffset, nextSize));
    };

    const stopResize = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", resizePanel);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);

    return () => {
      window.removeEventListener("pointermove", resizePanel);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      stopResize();
    };
  }, []);

  useEffect(() => {
    const dragPanel = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const maxLeft = Math.max(
        panelDragGutter,
        window.innerWidth - drag.width - panelDragGutter,
      );
      const maxTop = Math.max(
        panelDragGutter,
        window.innerHeight - drag.height - panelDragGutter,
      );
      const left = clamp(
        drag.startLeft + event.clientX - drag.startX,
        panelDragGutter,
        maxLeft,
      );
      const top = clamp(
        drag.startTop + event.clientY - drag.startY,
        panelDragGutter,
        maxTop,
      );

      setPanelOffset({
        x: left - drag.anchorLeft,
        y: top - drag.anchorTop,
      });
    };

    const stopDrag = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", dragPanel);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", dragPanel);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      stopDrag();
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleViewportResize = () => {
      if (isFullscreen) return;
      setPanelSize((current) => {
        const nextSize = clampPanelSize(current);
        setPanelOffset((offset) => clampPanelOffset(offset, nextSize));
        return nextSize;
      });
    };

    window.addEventListener("resize", handleViewportResize);

    return () => window.removeEventListener("resize", handleViewportResize);
  }, [isFullscreen, open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;
    setScrollToBottomSignal((current) => current + 1);
    void chat.sendMessage(draft);
    setDraft("");
  };

  const sendQuickPrompt = (prompt: string, displayContent = prompt) => {
    if (chat.isStreaming) return;
    setScrollToBottomSignal((current) => current + 1);
    void chat.sendMessage(prompt, { displayContent });
  };

  const retryLastMessage = () => {
    if (chat.isStreaming) return;
    setScrollToBottomSignal((current) => current + 1);
    chat.retryLastMessage();
  };

  const openWidget = () => {
    setOpen(true);
    props.onOpen?.();
  };

  const closeWidget = () => {
    restoreLauncherFocus.current = true;
    setOpen(false);
    props.onClose?.();
  };

  const toggleFullscreen = () => {
    setAppearanceOpen(false);
    setIsFullscreen((current) => !current);
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeWidget();
    }
  };

  const startPanelResize = (
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (isFullscreen) return;

    resizeRef.current = {
      handle,
      startOffset: panelOffsetRef.current,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: panelSize.width,
      startHeight: panelSize.height,
    };
    document.body.style.cursor = getResizeCursor(handle);
    document.body.style.userSelect = "none";
  };

  const startPanelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (isFullscreen || event.button !== 0 || window.innerWidth < 640) return;

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest(
        'button, a, input, textarea, select, [role="button"], [data-sidechat-no-drag="true"]',
      )
    ) {
      return;
    }

    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    const currentOffset = panelOffsetRef.current;

    dragRef.current = {
      anchorLeft: rect.left - currentOffset.x,
      anchorTop: rect.top - currentOffset.y,
      height: rect.height,
      startLeft: rect.left,
      startTop: rect.top,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  const handleComposerInputKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const widgetState = chat.isHistoryLoading
    ? "loading"
    : chat.error
      ? "error"
      : chat.isStreaming
        ? "streaming"
        : chat.messages.length === 0
          ? "empty"
          : "ready";

  if (!open) {
    return (
      <button
        ref={launcherButtonRef}
        type="button"
        aria-label="Open assistant"
        aria-expanded={false}
        aria-controls={panelId}
        className="fixed right-6 bottom-6 z-50 inline-flex items-center gap-2.5 rounded-md border px-5 py-3 text-base font-semibold shadow-md shadow-slate-950/10 transition duration-150 focus:ring-2 focus:outline-none max-sm:right-4 max-sm:bottom-4 max-sm:text-sm [&_svg]:size-5"
        style={{
          ...appearanceVars,
          background: "var(--sidechat-bg)",
          borderColor: "var(--sidechat-accent)",
          boxShadow:
            "0 10px 24px rgb(15 23 42 / 0.12), 0 0 0 3px color-mix(in srgb, var(--sidechat-accent) 14%, transparent)",
          color: "var(--sidechat-fg)",
          outlineColor: "var(--sidechat-accent)",
        }}
        data-sidechat-root="true"
        onClick={openWidget}
      >
        <Bot aria-hidden="true" />
        How can I help?
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      id={panelId}
      className={`fixed z-50 flex flex-col overflow-hidden border bg-white text-slate-950 ${
        isFullscreen
          ? "inset-0 max-h-none max-w-none rounded-none border-0 shadow-none"
          : "right-5 bottom-5 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] min-w-[35rem] rounded-lg border-slate-300 shadow-xl shadow-slate-950/15 max-sm:right-3 max-sm:bottom-3 max-sm:left-3 max-sm:min-w-0 max-sm:max-w-none"
      }`}
      style={{
        ...appearanceVars,
        width: isFullscreen
          ? "100vw"
          : `min(${panelSize.width}px, calc(100vw - 2rem))`,
        height: isFullscreen
          ? "100vh"
          : `min(${panelSize.height}px, calc(100vh - 2rem))`,
        background: "var(--sidechat-bg)",
        borderColor: "var(--sidechat-border)",
        color: "var(--sidechat-fg)",
        transform: isFullscreen
          ? "none"
          : `translate(${panelOffset.x}px, ${panelOffset.y}px)`,
        willChange: isFullscreen ? "auto" : "transform",
      }}
      aria-label={props.title ?? "Side chat assistant"}
      aria-live="polite"
      data-testid="side-chat-widget"
      data-sidechat-root="true"
      data-state={widgetState}
      onKeyDown={handlePanelKeyDown}
    >
      {!isFullscreen ? (
        <>
          <button
            type="button"
            aria-label="Resize assistant panel from top left"
            className="absolute top-0 left-0 z-10 size-5 cursor-nwse-resize rounded-br-md border-r border-b border-slate-300 bg-white shadow-sm hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none max-sm:hidden"
            onPointerDown={(event) => startPanelResize("top-left", event)}
          />
          <button
            type="button"
            aria-label="Resize assistant panel from top right"
            className="absolute top-0 right-0 z-10 size-5 cursor-nesw-resize rounded-bl-md border-b border-l border-slate-300 bg-white shadow-sm hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none max-sm:hidden"
            onPointerDown={(event) => startPanelResize("top-right", event)}
          />
          <button
            type="button"
            aria-label="Resize assistant panel from left edge"
            className="absolute top-6 bottom-6 left-0 z-10 w-2 cursor-ew-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden"
            onPointerDown={(event) => startPanelResize("left", event)}
          />
          <button
            type="button"
            aria-label="Resize assistant panel from right edge"
            className="absolute top-6 right-0 bottom-6 z-10 w-2 cursor-ew-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden"
            onPointerDown={(event) => startPanelResize("right", event)}
          />
          <button
            type="button"
            aria-label="Resize assistant panel height"
            className="absolute top-0 right-6 left-6 z-10 h-2 cursor-ns-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden"
            onPointerDown={(event) => startPanelResize("top", event)}
          />
          <button
            type="button"
            aria-label="Resize assistant panel from bottom edge"
            className="absolute right-6 bottom-0 left-6 z-10 h-2 cursor-ns-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden"
            onPointerDown={(event) => startPanelResize("bottom", event)}
          />
        </>
      ) : null}
      <header
        className={`flex shrink-0 touch-none select-none items-start justify-between gap-5 px-8 pt-8 pb-4 max-sm:px-4 max-sm:pt-5 ${
          isFullscreen
            ? "cursor-default"
            : "cursor-grab active:cursor-grabbing max-sm:cursor-default"
        }`}
        onPointerDown={startPanelDrag}
        style={{ background: "var(--sidechat-bg)" }}
      >
        <div className="min-w-0">
          <strong
            className="block text-2xl font-semibold tracking-tight max-sm:text-lg"
            style={{ color: "var(--sidechat-fg)" }}
          >
            {props.title ?? "Workspace Assistant"}
          </strong>
          <div className="mt-6 flex items-center gap-3 text-base text-slate-500 max-sm:mt-3 max-sm:text-sm">
            <Copy aria-hidden="true" className="size-5 shrink-0 text-slate-500" />
            <span>Using current page context</span>
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: "var(--sidechat-accent)" }}
            />
          </div>
        </div>
        <div className="relative flex shrink-0 items-start gap-1">
          <button
            type="button"
            aria-expanded={appearanceOpen}
            aria-label="Customize assistant appearance"
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 focus:ring-2 focus:outline-none max-sm:size-11 [&_svg]:size-7 max-sm:[&_svg]:size-5"
            onClick={() => setAppearanceOpen((current) => !current)}
            style={{ outlineColor: "var(--sidechat-accent)" }}
          >
            <Settings aria-hidden="true" />
          </button>
          {appearanceOpen ? (
            <section
              aria-label="Appearance presets"
              className="absolute top-14 right-28 z-30 w-80 rounded-lg border bg-white p-4 text-base shadow-xl shadow-slate-950/15 max-sm:right-0 max-sm:w-[calc(100vw-3rem)]"
              style={{
                background: "var(--sidechat-bg)",
                borderColor: "var(--sidechat-border)",
                color: "var(--sidechat-fg)",
              }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <strong className="text-base">Appearance</strong>
                <button
                  type="button"
                  className="rounded border px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus:ring-2 focus:outline-none"
                  onClick={resetAppearancePreset}
                  style={{
                    borderColor: "var(--sidechat-border)",
                    outlineColor: "var(--sidechat-accent)",
                  }}
                >
                  Reset
                </button>
              </div>
              <p className="mb-3 m-0 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Presets only
              </p>
              <div className="space-y-2">
                {appearancePresets.map((preset) => {
                  const selected = preset.id === appearancePreset.id;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={selected}
                      className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition hover:bg-slate-50 focus:ring-2 focus:outline-none"
                      onClick={() => {
                        selectAppearancePreset(preset.id);
                      }}
                      style={{
                        background: selected
                          ? "var(--sidechat-surface)"
                          : "transparent",
                        borderColor: selected
                          ? "var(--sidechat-accent)"
                          : "var(--sidechat-border)",
                        outlineColor: "var(--sidechat-accent)",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="size-5 rounded-full border"
                        style={{
                          background: preset.accent,
                          borderColor: "var(--sidechat-border)",
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{preset.label}</span>
                        <span className="block text-sm text-slate-500">
                          {preset.accent} accent
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {[preset.background, preset.surface, preset.foreground].map(
                          (color) => (
                            <span
                              aria-hidden="true"
                              className="size-4 rounded border"
                              key={color}
                              style={{
                                background: color,
                                borderColor: "var(--sidechat-border)",
                              }}
                            />
                          ),
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
          <button
            type="button"
            aria-label={
              isFullscreen ? "Unfullscreen assistant" : "Fullscreen assistant"
            }
            aria-pressed={isFullscreen}
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 focus:ring-2 focus:outline-none max-sm:size-11 [&_svg]:size-7 max-sm:[&_svg]:size-5"
            onClick={toggleFullscreen}
            style={{ outlineColor: "var(--sidechat-accent)" }}
            title={isFullscreen ? "Unfullscreen" : "Full screen"}
          >
            {isFullscreen ? (
              <Minimize2 aria-hidden="true" />
            ) : (
              <Maximize2 aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label="Close assistant"
            aria-expanded={true}
            aria-controls={panelId}
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 focus:ring-2 focus:ring-blue-500/20 focus:outline-none max-sm:size-11 [&_svg]:size-8 max-sm:[&_svg]:size-6"
            onClick={closeWidget}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </header>

      <Conversation className="sidechat-conversation mx-auto mt-4 w-full max-w-3xl px-8 max-sm:px-4">
        <ConversationContent className="min-h-full gap-6 px-0 pt-0 pb-5">
          {chat.isHistoryLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading conversation history...
            </p>
          ) : null}
          {chat.historyStatus === "loaded" ? (
            <p className="m-0 self-start rounded border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground">
              Loaded conversation history.
            </p>
          ) : null}
          {chat.historyStatus === "empty" ? (
            <p className="m-0 self-start rounded border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground">
              No prior messages in this conversation.
            </p>
          ) : null}
          {chat.messages.length === 0 ? (
            <ConversationEmptyState
              className="rounded-md border border-dashed border-border bg-background text-muted-foreground"
              description="Ask a question about this workspace, switch models, or try a markdown-heavy prompt."
              title="How can I help?"
            />
          ) : (
            chat.messages.map((message) => {
              const assistantParts =
                message.role === "assistant" ? getAssistantParts(message) : [];
              const attachments =
                message.role === "assistant"
                  ? [
                      ...getMessageAttachments(assistantParts, apiEndpoint),
                      ...getMetadataAttachments(
                        message.metadata,
                        apiEndpoint,
                      ),
                    ]
                  : [];
              const assistantContent =
                message.role === "assistant"
                  ? cleanReportResponseText(
                      parseCitationMetadata(message.content).content,
                      attachments.length > 0,
                    )
                  : message.content;
              const persistedSources =
                message.role === "assistant"
                  ? [
                      ...getMetadataSources(message.metadata),
                      ...parseCitationMetadata(message.content).sources,
                    ]
                  : [];
              const liveSources =
                message.role === "assistant"
                  ? assistantParts
                      .filter(isToolPart)
                      .filter((part) => part.status === "completed")
                      .flatMap((part) => getToolSources(part.output))
                  : [];
              const inlineSources = selectInlineSources(assistantContent, [
                ...persistedSources,
                ...liveSources,
              ]);
              const isActiveAssistant =
                message.role === "assistant" &&
                chat.isStreaming &&
                chat.activeAssistantMessageId === message.id;

              return (
                <Message from={message.role} key={message.id}>
                  {message.role === "assistant"
                    ? assistantParts.map((part) =>
                        part.type === "reasoning" ? (
                          <Reasoning
                            isStreaming={
                              chat.isStreaming &&
                              chat.activeAssistantMessageId === message.id &&
                              part === assistantParts.at(-1)
                            }
                            key={part.id}
                          >
                            {part.content}
                          </Reasoning>
                        ) : part.type === "host-command" ? (
                          <div className="space-y-2" key={part.id}>
                            <Tool
                              toolName="host_command"
                              displayName="Host surface command"
                              status={getHostCommandToolStatus(part)}
                              input={part.command}
                              output={part.result}
                              error={
                                part.result?.status &&
                                part.result.status !== "applied"
                                  ? part.result.message
                                  : undefined
                              }
                            />
                          </div>
                        ) : (
                          <div className="space-y-2" key={part.id}>
                            <Tool
                              toolName={part.toolName}
                              displayName={
                                toolDisplayNames[part.toolName] ?? part.toolName
                              }
                              status={part.status}
                              input={part.input}
                              output={part.output}
                              error={part.error}
                            />
                          </div>
                        ),
                      )
                    : null}
                  <MessageContent data-message-from={message.role}>
                    {message.role === "assistant" ? (
                      assistantContent ? (
                        <>
                          <MessageResponse>{assistantContent}</MessageResponse>
                          {inlineSources.length > 0 ? (
                            <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
                              <span>Source</span>
                              <Citations sources={inlineSources} />
                            </div>
                          ) : null}
                        </>
                      ) : isActiveAssistant ? null : attachments.length > 0 ? (
                        <span className="text-muted-foreground">
                          Report ready.
                        </span>
                      ) : (
                        null
                      )
                    ) : (
                      message.content
                    )}
                  </MessageContent>
                  {attachments.length > 0 ? (
                    <Attachments className="w-full max-w-2xl">
                      {attachments.map((attachment) => (
                        <Attachment data={attachment} key={attachment.id}>
                          <AttachmentPreview />
                          <AttachmentInfo />
                          <AttachmentAction />
                        </Attachment>
                      ))}
                    </Attachments>
                  ) : null}
                </Message>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollToBottomSignal signal={scrollToBottomSignal} />
        <ConversationScrollButton />
      </Conversation>

      {chat.error ? (
        <div
          role="alert"
          className="mx-auto mt-3 w-[calc(100%-4rem)] max-w-3xl shrink-0 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-base text-red-900 max-sm:w-[calc(100%-2rem)]"
        >
          {chat.error.message}
          {chat.error.retryable ? (
            <button
              type="button"
              className="ml-3 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-800 transition hover:bg-red-100 focus:ring-2 focus:ring-red-500/15 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              onClick={retryLastMessage}
              disabled={chat.isStreaming}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {chat.isStreaming ? (
        <div
          className="mx-auto mt-4 flex w-full max-w-3xl shrink-0 items-center gap-2 px-8 text-sm font-medium max-sm:px-4"
          style={{
            color:
              "color-mix(in srgb, var(--sidechat-accent) 82%, var(--sidechat-fg))",
          }}
        >
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          <span role="status">Streaming...</span>
        </div>
      ) : null}

      <div className="mx-auto mt-6 flex w-full max-w-3xl shrink-0 items-center gap-4 px-8 max-sm:px-4 max-sm:gap-2">
        <Suggestions className="min-w-0 flex-1">
          <Suggestion
            disabled={chat.isStreaming}
            onClick={() => sendQuickPrompt("Summarize this page")}
          >
            <ListChecks
              aria-hidden="true"
              style={{ color: "var(--sidechat-accent)" }}
            />
            Summarize this page
          </Suggestion>
          <Suggestion
            disabled={chat.isStreaming}
            onClick={() =>
              sendQuickPrompt(
                "Generate a report",
                "Generate report",
              )
            }
          >
            <FileText
              aria-hidden="true"
              style={{ color: "var(--sidechat-accent)" }}
            />
            Generate report
          </Suggestion>
          <Suggestion
            disabled={chat.isStreaming}
            onClick={() =>
              sendQuickPrompt("Who is our biggest client?")
            }
          >
            <Trophy
              aria-hidden="true"
              style={{ color: "var(--sidechat-accent)" }}
            />
            Biggest client
          </Suggestion>
        </Suggestions>
        <button
          type="button"
          aria-label="Retry last message"
          className="ml-auto inline-flex size-12 items-center justify-center rounded-lg border bg-white text-slate-500 shadow-sm transition hover:text-slate-900 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 max-sm:ml-0 max-sm:size-10 [&_svg]:size-5"
          disabled={chat.isStreaming}
          onClick={retryLastMessage}
          style={{
            borderColor: "var(--sidechat-border)",
            outlineColor: "var(--sidechat-accent)",
          }}
        >
          <RefreshCcw aria-hidden="true" />
        </button>
      </div>

      <PromptInput className="mx-auto w-full max-w-3xl" onSubmit={submit}>
        <PromptInputTextarea
          ref={inputRef}
          value={draft}
          aria-label="chat-input"
          placeholder={props.placeholder ?? "Ask about this page"}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleComposerInputKeyDown}
        />
        <PromptInputToolbar>
          <PromptInputTools>
            <Context
              description="Visible conversation context is trimmed to the last 12 messages and 6k characters."
              label="Context"
              maxTokens={recentContextTotalCharacters}
              usage={chat.usage}
              usageLabel="Conversation usage"
              usedTokens={visibleContextCharacters}
            >
              <ContextTrigger />
              <ContextContent>
                <ContextContentHeader />
                <ContextContentBody />
                <ContextContentFooter />
              </ContextContent>
            </Context>
            <PromptInputButton disabled title="Search is not enabled yet">
              <Globe2 aria-hidden="true" />
              Search
            </PromptInputButton>
            <PromptInputModelSelect
              disabled={chat.isStreaming}
              modelId={selectedModelAliasId}
              onModelChange={selectModelAlias}
              options={modelAliasOptions}
            />
          </PromptInputTools>
          <PromptInputSubmit aria-label="send message" disabled={!canSend}>
            <Send aria-hidden="true" />
          </PromptInputSubmit>
        </PromptInputToolbar>
      </PromptInput>
    </aside>
  );
}
