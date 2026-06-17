import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useWidgetChat } from "#features/chat";
import {
  ConversationSidebar,
  ConversationSwitcher,
  WidgetConversation,
  WidgetEmptyState,
  WidgetHeaderTitle,
  type WidgetEmptyStateSuggestion,
} from "#features/conversation";
import {
  ClosedWidgetLauncher,
  ResizeHandles,
  toPanelStyle,
  useResizableWidgetPanel,
  WidgetHeader,
} from "#features/panel";
import { WidgetFooter } from "#features/prompt";
import { SettingsView } from "#features/settings";
import { useWidgetTheme } from "#features/theme";
import { DEFAULT_REASONING_VISIBILITY } from "#entities/settings";
import { Code2Icon, FileTextIcon, LightbulbIcon, PenLineIcon, type LucideIcon } from "lucide-react";
import { createSideChatWidgetQueryClient } from "../model/side-chat-query-client.js";
import type { SideChatWidgetLabels, SideChatWidgetProps } from "../model/side-chat-widget.types.js";

export type {
  SideChatWidgetAssistantProfile,
  SideChatWidgetLabels,
  SideChatWidgetPanelActions,
  SideChatWidgetPanelSize,
  SideChatWidgetProps,
  SideChatWidgetQuickAction,
  SideChatWidgetStateSnapshot,
} from "../model/side-chat-widget.types.js";

const defaultLabels = {
  placeholder: "Ask anything...",
  send: "Send",
  title: "Workspace Assistant",
} satisfies Required<SideChatWidgetLabels>;

const EMPTY_STATE_DESCRIPTION =
  "I can see the page you're viewing. Ask about it, or pick a place to start.";
const EMPTY_STATE_TITLE = "How can I help with this page?";

// A small rotation so suggestion rows read as distinct actions without requiring the
// host to supply per-action icons.
const SUGGESTION_ICONS: readonly LucideIcon[] = [
  FileTextIcon,
  LightbulbIcon,
  Code2Icon,
  PenLineIcon,
];

// Below this panel/viewport size the conversation switcher lives in the header; above
// it, a persistent sidebar takes over (see useIsWidePanel).
const WIDE_PANEL_WIDTH = 720;
const WIDE_VIEWPORT_WIDTH = 780;

export const SideChatWidget = (props: SideChatWidgetProps) => {
  const [queryClient] = useState(createSideChatWidgetQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <SideChatWidgetContent {...props} />
    </QueryClientProvider>
  );
};

const SideChatWidgetContent = ({
  assistantProfiles = [],
  client,
  conversationStorageKey,
  defaultAssistantProfileId,
  defaultOpen = true,
  defaultPanelSize,
  defaultTheme,
  hostBridge,
  labels,
  panelActions,
  quickActions = [],
  reasoningVisibility = DEFAULT_REASONING_VISIBILITY,
  themeStorageKey,
}: SideChatWidgetProps) => {
  const resolvedLabels = resolveWidgetLabels(labels);
  const initialProfileId = resolveInitialProfileId(defaultAssistantProfileId, assistantProfiles);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfileId);
  const panel = useResizableWidgetPanel(defaultPanelSize);
  const theme = useWidgetTheme({ defaultTheme, storageKey: themeStorageKey });
  const isWide = useIsWidePanel(panel.panelSize.width);
  const selectedProfile = useMemo(
    () => assistantProfiles.find((profile) => profile.id === selectedProfileId),
    [assistantProfiles, selectedProfileId],
  );
  const hasProfiles = assistantProfiles.length > 0;
  const chat = useWidgetChat({
    client,
    conversationStorageKey,
    hostBridge,
    selectedProfileId,
  });
  const isBusy = isBusyStatus(chat.status);
  const suggestions = useMemo(() => toEmptyStateSuggestions(quickActions), [quickActions]);

  if (!isOpen) {
    return (
      <ClosedWidgetLauncher
        label={resolvedLabels.title}
        onOpen={() => setIsOpen(true)}
        {...theme.themeRootProps}
      />
    );
  }

  return (
    <section
      aria-label={resolvedLabels.title}
      className="side-chat-widget-root fixed right-4 bottom-4 z-50 flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-xl"
      style={toPanelStyle(panel.panelSize, panel.panelOffset)}
      {...theme.themeRootProps}
    >
      <ResizeHandles onResizeStart={panel.startResize} />
      {/* Sidebar is full height; the header lives inside the main column beside it. */}
      <div className="flex min-h-0 flex-1">
        {isWide && (
          <ConversationSidebar
            conversations={chat.conversations}
            disabled={isBusy}
            onNewConversation={chat.startNewConversation}
            onSelectConversation={chat.selectConversation}
            selectedConversationId={chat.conversationId}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <WidgetHeader
            newConversationDisabled={isBusy && chat.conversationId === undefined}
            onClose={() => {
              panelActions?.onClose?.();
              setIsOpen(false);
            }}
            onNewConversation={chat.startNewConversation}
            onOpenSettings={() => setIsSettingsOpen(true)}
            title={
              isWide ? (
                <WidgetHeaderTitle title={resolvedLabels.title} />
              ) : (
                <ConversationSwitcher
                  conversations={chat.conversations}
                  disabled={isBusy}
                  onNewConversation={chat.startNewConversation}
                  onSelectConversation={chat.selectConversation}
                  selectedConversationId={chat.conversationId}
                  title={resolvedLabels.title}
                />
              )
            }
          />
          <WidgetConversation
            emptyState={
              <WidgetEmptyState
                assistantTitle={resolvedLabels.title}
                description={EMPTY_STATE_DESCRIPTION}
                onSelectSuggestion={(prompt) => void chat.submitMessage(prompt)}
                suggestions={suggestions}
                title={EMPTY_STATE_TITLE}
              />
            }
            errorMessage={chat.errorMessage}
            isLoadingHistory={chat.isLoadingHistory}
            messages={chat.messages}
            onDismissError={chat.clearError}
            onRetry={chat.retryLastMessage}
            reasoningVisibility={reasoningVisibility}
          />
          <WidgetFooter
            isBusy={isBusy}
            labels={resolvedLabels}
            messages={chat.messages}
            onProfileSelect={setSelectedProfileId}
            onSubmitMessage={chat.submitMessage}
            profiles={hasProfiles ? assistantProfiles : []}
            selectedProfileId={selectedProfileId}
            selectedProfileLabel={selectedProfile?.label}
            status={chat.status}
            stop={chat.stop}
            usage={chat.usage}
          />
        </div>
      </div>
      {isSettingsOpen && (
        // Full-panel overlay (covers the sidebar + main column), matching the mock.
        <div className="absolute inset-0 z-[65] flex flex-col bg-card">
          <SettingsView
            onBack={() => setIsSettingsOpen(false)}
            onSelectTheme={theme.setTheme}
            themeId={theme.themeId}
          />
        </div>
      )}
    </section>
  );
};

// Reveals the conversation sidebar only when both the panel and the host viewport
// have room — otherwise the header switcher stays the single-column control.
const useIsWidePanel = (panelWidth: number): boolean => {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  return panelWidth >= WIDE_PANEL_WIDTH && viewportWidth > WIDE_VIEWPORT_WIDTH;
};

const toEmptyStateSuggestions = (
  quickActions: readonly { readonly id: string; readonly label: string; readonly prompt: string }[],
): readonly WidgetEmptyStateSuggestion[] =>
  quickActions.map((action, index) => ({
    ...action,
    icon: SUGGESTION_ICONS[index % SUGGESTION_ICONS.length]!,
  }));

const resolveWidgetLabels = (labels: SideChatWidgetLabels | undefined) => ({
  placeholder: labels?.placeholder ?? defaultLabels.placeholder,
  send: labels?.send ?? defaultLabels.send,
  title: labels?.title ?? defaultLabels.title,
});

const resolveInitialProfileId = (
  defaultAssistantProfileId: string | undefined,
  assistantProfiles: readonly { readonly id: string }[],
): string | undefined => defaultAssistantProfileId ?? assistantProfiles.at(0)?.id;

const isBusyStatus = (status: string): boolean => status === "submitted" || status === "streaming";
