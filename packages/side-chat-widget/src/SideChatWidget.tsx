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
  RefreshCcw,
  Settings,
  Trophy,
  Send,
  X,
} from "lucide-react";
import type { ModelSelection, TokenUsage } from "@side-chat/shared-protocol";
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

export type SideChatWidgetProps = {
  apiEndpoint: string;
  workspaceId: string;
  initialConversationId?: string;
  historyEndpoint?: string;
  title?: string;
  placeholder?: string;
  defaultModel?: ModelSelection;
  availableModels?: ModelSelection[];
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: SideChatError) => void;
  onUsage?: (usage: TokenUsage) => void;
};

const fallbackModel: ModelSelection = {
  provider: "openai",
  id: "gpt-5.4-nano",
  reasoningEffort: "medium",
};
const panelId = "side-chat-widget-panel";
const defaultPanelWidth = 900;
const minPanelSize = { width: 560, height: 560 };
const viewportGutter = 32;
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
  generate_workbench_report: "PDF report",
};

type WidgetMessagePart = NonNullable<
  ReturnType<typeof useSideChat>["messages"][number]["parts"]
>[number];

type WidgetToolPart = Extract<WidgetMessagePart, { type: "tool" }>;

const getDefaultPanelSize = () =>
  clampPanelSize({
    width: defaultPanelWidth,
    height:
      typeof window === "undefined"
        ? 840
        : Math.round(window.innerHeight * defaultPanelHeightRatio),
  });

type ResizeAxis = "width" | "height" | "both";

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

const isToolPart = (
  part: WidgetMessagePart,
): part is Extract<WidgetMessagePart, { type: "tool" }> =>
  part.type === "tool";

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
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearancePresetId, setAppearancePresetId] =
    useState<AppearancePresetId>(defaultAppearancePresetId);
  const [scrollToBottomSignal, setScrollToBottomSignal] = useState(0);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const restoreLauncherFocus = useRef(false);
  const resizeRef = useRef<{
    axis: ResizeAxis;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const models = useMemo(
    () =>
      props.availableModels?.length ? props.availableModels : [fallbackModel],
    [props.availableModels],
  );
  const chat = useSideChat({
    apiEndpoint: props.apiEndpoint,
    workspaceId: props.workspaceId,
    initialConversationId: props.initialConversationId,
    historyEndpoint: props.historyEndpoint,
    defaultModel: props.defaultModel ?? models[0],
    onError: props.onError,
    onUsage: props.onUsage,
  });

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
        resize.axis === "width" || resize.axis === "both"
          ? resize.startWidth + resize.startX - event.clientX
          : resize.startWidth;
      const nextHeight =
        resize.axis === "height" || resize.axis === "both"
          ? resize.startHeight + resize.startY - event.clientY
          : resize.startHeight;

      setPanelSize(clampPanelSize({ width: nextWidth, height: nextHeight }));
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

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeWidget();
    }
  };

  const startPanelResize = (
    axis: ResizeAxis,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    resizeRef.current = {
      axis,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: panelSize.width,
      startHeight: panelSize.height,
    };
    document.body.style.cursor =
      axis === "both"
        ? "nwse-resize"
        : axis === "width"
          ? "ew-resize"
          : "ns-resize";
    document.body.style.userSelect = "none";
  };

  const handleComposerInputKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;

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
      id={panelId}
      className="fixed right-5 bottom-5 z-50 flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] min-w-[35rem] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-950 shadow-xl shadow-slate-950/15 max-sm:right-3 max-sm:bottom-3 max-sm:left-3 max-sm:min-w-0 max-sm:max-w-none"
      style={{
        ...appearanceVars,
        width: `min(${panelSize.width}px, calc(100vw - 2rem))`,
        height: `min(${panelSize.height}px, calc(100vh - 2rem))`,
        background: "var(--sidechat-bg)",
        borderColor: "var(--sidechat-border)",
        color: "var(--sidechat-fg)",
      }}
      aria-label={props.title ?? "Side chat assistant"}
      aria-live="polite"
      data-testid="side-chat-widget"
      data-sidechat-root="true"
      data-state={widgetState}
      onKeyDown={handlePanelKeyDown}
    >
      <button
        type="button"
        aria-label="Resize assistant panel diagonally"
        className="absolute top-0 left-0 z-10 size-5 cursor-nwse-resize rounded-br-md border-r border-b border-slate-300 bg-white shadow-sm hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none max-sm:hidden"
        onPointerDown={(event) => startPanelResize("both", event)}
      />
      <button
        type="button"
        aria-label="Resize assistant panel width"
        className="absolute top-6 bottom-6 left-0 z-10 w-2 cursor-ew-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden"
        onPointerDown={(event) => startPanelResize("width", event)}
      />
      <button
        type="button"
        aria-label="Resize assistant panel height"
        className="absolute top-0 right-6 left-6 z-10 h-2 cursor-ns-resize hover:bg-blue-500/10 focus:bg-blue-500/10 focus:outline-none max-sm:hidden"
        onPointerDown={(event) => startPanelResize("height", event)}
      />
      <header
        className="flex shrink-0 items-start justify-between gap-5 px-8 pt-8 pb-4 max-sm:px-4 max-sm:pt-5"
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
              className="absolute top-14 right-12 z-30 w-80 rounded-lg border bg-white p-4 text-base shadow-xl shadow-slate-950/15 max-sm:right-0 max-sm:w-[calc(100vw-3rem)]"
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

      <Conversation className="sidechat-conversation mx-8 mt-4 max-sm:mx-4">
        <ConversationContent className="min-h-full gap-6 px-0 pt-0 pb-5">
          {chat.isHistoryLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading conversation history...
            </p>
          ) : null}
          {chat.historyStatus === "loaded" ? (
            <p className="m-0 self-start rounded border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground">
              Loaded seeded conversation history.
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
                  ? getMessageAttachments(assistantParts, props.apiEndpoint)
                  : [];
              const assistantContent =
                message.role === "assistant"
                  ? cleanReportResponseText(
                      message.content,
                      attachments.length > 0,
                    )
                  : message.content;
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
                        ) : (
                          <Tool
                            key={part.id}
                            toolName={part.toolName}
                            displayName={
                              toolDisplayNames[part.toolName] ?? part.toolName
                            }
                            status={part.status}
                            input={part.input}
                            output={part.output}
                            error={part.error}
                          />
                        ),
                      )
                    : null}
                  <MessageContent data-message-from={message.role}>
                    {message.role === "assistant" ? (
                      assistantContent ? (
                        <MessageResponse>{assistantContent}</MessageResponse>
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
          className="mx-5 mt-3 shrink-0 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-base text-red-900 max-sm:mx-4"
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
          className="mx-8 mt-4 flex shrink-0 items-center gap-2 text-sm font-medium max-sm:mx-4"
          style={{
            color:
              "color-mix(in srgb, var(--sidechat-accent) 82%, var(--sidechat-fg))",
          }}
        >
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          <span role="status">Streaming...</span>
        </div>
      ) : null}

      <div className="mx-8 mt-6 flex shrink-0 items-center gap-4 max-sm:mx-4 max-sm:gap-2">
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
              sendQuickPrompt(
                "Use workbench_query with client_portfolio_review and answer: who is our biggest client by AUM?",
                "Who is our biggest client?",
              )
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

      <PromptInput onSubmit={submit}>
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
              usageLabel="Last request usage"
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
            <PromptInputModelSelect modelId={chat.model.id} />
          </PromptInputTools>
          <PromptInputSubmit aria-label="send message" disabled={!canSend}>
            <Send aria-hidden="true" />
          </PromptInputSubmit>
        </PromptInputToolbar>
      </PromptInput>
    </aside>
  );
}
