import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";
import type {
  HostCommand,
  HostCommandResult,
  HostContextSnapshot,
  ModelSelection,
  TokenUsage,
} from "@side-chat/shared-protocol";
import {
  appearanceStorageKey,
  defaultAppearancePresetId,
  getAppearancePreset,
  isAppearancePresetId,
  type AppearancePresetId,
} from "./domain/appearance.js";
import {
  defaultModelAliasId,
  fallbackModel,
  resolveModelAliasId,
} from "./domain/model-selection.js";
import {
  clamp,
  clampPanelOffset,
  clampPanelSize,
  getDefaultPanelSize,
  getPanelAnchorPosition,
  getResizeCursor,
  handleResizesFromBottom,
  handleResizesFromLeft,
  handleResizesFromRight,
  handleResizesFromTop,
  panelDragGutter,
  panelId,
  type PanelOffset,
  type ResizeHandle,
} from "./domain/panel-geometry.js";
import {
  getVisibleContextCharacters,
} from "./domain/message-presentation.js";
import { useSideChat, type SideChatError } from "./hooks/use-side-chat.js";
import { ChatComposer } from "./ui/ChatComposer.js";
import { ConversationPanel } from "./ui/ConversationPanel.js";
import { QuickActions } from "./ui/QuickActions.js";
import { ResizeHandles } from "./ui/ResizeHandles.js";
import { ErrorBanner, StreamingStatus } from "./ui/WidgetStatus.js";
import { WidgetHeader } from "./ui/WidgetHeader.js";
import { WidgetLauncher } from "./ui/WidgetLauncher.js";

export {
  getMetadataAttachments,
  inferInlineSourcesFromContent,
  mergeAttachments,
  parseCitationMetadata,
  selectInlineSources,
} from "./domain/message-presentation.js";

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
    setSelectedModelAliasId(resolveModelAliasId(aliasId));
    chat.setModel(models[0]);
  };

  const canSend = draft.trim().length > 0 && !chat.isStreaming;
  const visibleContextCharacters = getVisibleContextCharacters(chat.messages);
  const appearancePreset = getAppearancePreset(appearancePresetId);
  const appearanceVars = {
    "--sidechat-accent": appearancePreset.accent,
    "--sidechat-bg": appearancePreset.background,
    "--sidechat-fg": appearancePreset.foreground,
    "--sidechat-surface": appearancePreset.surface,
    "--sidechat-border": appearancePreset.border,
  } as CSSProperties;

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

  const widgetState = getWidgetState({
    hasError: Boolean(chat.error),
    isHistoryLoading: chat.isHistoryLoading,
    isStreaming: chat.isStreaming,
    messageCount: chat.messages.length,
  });

  if (!open) {
    return (
      <WidgetLauncher
        appearanceVars={appearanceVars}
        launcherButtonRef={launcherButtonRef}
        onOpen={openWidget}
      />
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
      {!isFullscreen ? <ResizeHandles onResizeStart={startPanelResize} /> : null}
      <WidgetHeader
        appearanceOpen={appearanceOpen}
        appearancePreset={appearancePreset}
        isFullscreen={isFullscreen}
        title={props.title}
        onAppearanceToggle={() => setAppearanceOpen((current) => !current)}
        onClose={closeWidget}
        onDragStart={startPanelDrag}
        onFullscreenToggle={toggleFullscreen}
        onResetAppearance={resetAppearancePreset}
        onSelectAppearance={selectAppearancePreset}
      />
      <ConversationPanel
        activeAssistantMessageId={chat.activeAssistantMessageId}
        apiEndpoint={apiEndpoint}
        error={chat.error}
        historyStatus={chat.historyStatus}
        isHistoryLoading={chat.isHistoryLoading}
        isStreaming={chat.isStreaming}
        messages={chat.messages}
        scrollToBottomSignal={scrollToBottomSignal}
      />
      {chat.error ? (
        <ErrorBanner
          error={chat.error}
          isStreaming={chat.isStreaming}
          onRetry={retryLastMessage}
        />
      ) : null}
      {chat.isStreaming ? <StreamingStatus /> : null}
      <QuickActions
        isStreaming={chat.isStreaming}
        onQuickPrompt={sendQuickPrompt}
        onRetry={retryLastMessage}
      />
      <ChatComposer
        canSend={canSend}
        draft={draft}
        inputRef={inputRef}
        isStreaming={chat.isStreaming}
        modelAliasId={selectedModelAliasId}
        placeholder={props.placeholder}
        usage={chat.usage}
        visibleContextCharacters={visibleContextCharacters}
        onDraftChange={setDraft}
        onModelAliasChange={selectModelAlias}
        onSubmit={submit}
      />
    </aside>
  );
}

type WidgetStateInput = {
  hasError: boolean;
  isHistoryLoading: boolean;
  isStreaming: boolean;
  messageCount: number;
};

const getWidgetState = ({
  hasError,
  isHistoryLoading,
  isStreaming,
  messageCount,
}: WidgetStateInput) => {
  if (isHistoryLoading) return "loading";
  if (hasError) return "error";
  if (isStreaming) return "streaming";
  if (messageCount === 0) return "empty";
  return "ready";
};
