import { useMemo, useState } from "react";

import { useWidgetChat } from "#features/chat";
import { WidgetConversation, WidgetError } from "#features/conversation";
import {
  ClosedWidgetLauncher,
  ResizeHandles,
  toPanelStyle,
  useResizableWidgetPanel,
  WidgetHeader,
} from "#features/panel";
import { WidgetFooter } from "#features/prompt";
import { Button } from "#shared/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxSelectTrigger,
} from "#shared/ui/combobox";
import { PlusIcon } from "lucide-react";
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

export const SideChatWidget = ({
  assistantProfiles = [],
  client,
  conversationStorageKey,
  defaultAssistantProfileId,
  defaultOpen = true,
  defaultPanelSize,
  hostBridge,
  labels,
  panelActions,
  quickActions = [],
}: SideChatWidgetProps) => {
  const resolvedLabels = resolveWidgetLabels(labels);
  const initialProfileId = resolveInitialProfileId(defaultAssistantProfileId, assistantProfiles);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfileId);
  const panel = useResizableWidgetPanel(defaultPanelSize);
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

  if (!isOpen) {
    return <ClosedWidgetLauncher label={resolvedLabels.title} onOpen={() => setIsOpen(true)} />;
  }

  return (
    <section
      aria-label={resolvedLabels.title}
      className="side-chat-widget-root fixed right-4 bottom-4 z-50 flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-border bg-background text-foreground shadow-xl"
      style={toPanelStyle(panel.panelSize, panel.panelOffset)}
    >
      <ResizeHandles onResizeStart={panel.startResize} />
      <WidgetHeader
        actions={
          <ConversationHistoryControls
            conversations={chat.conversations}
            disabled={isBusy}
            onNewConversation={chat.startNewConversation}
            onSelectConversation={chat.selectConversation}
            selectedConversationId={chat.conversationId}
          />
        }
        onClose={() => {
          panelActions?.onClose?.();
          setIsOpen(false);
        }}
        title={resolvedLabels.title}
      />
      <WidgetConversation messages={chat.messages} />
      <WidgetError message={chat.errorMessage} onDismiss={chat.clearError} />
      <WidgetFooter
        isBusy={isBusy}
        labels={resolvedLabels}
        messageCount={chat.messages.length}
        messages={chat.messages}
        onSubmitMessage={chat.submitMessage}
        onProfileSelect={setSelectedProfileId}
        profiles={hasProfiles ? assistantProfiles : []}
        quickActions={quickActions}
        selectedProfileId={selectedProfileId}
        selectedProfileLabel={selectedProfile?.label}
        status={chat.status}
        stop={chat.stop}
        usage={chat.usage}
      />
    </section>
  );
};

const ConversationHistoryControls = ({
  conversations,
  disabled,
  onNewConversation,
  onSelectConversation,
  selectedConversationId,
}: {
  readonly conversations: readonly { readonly id: string; readonly title: string }[];
  readonly disabled: boolean;
  readonly onNewConversation: () => void;
  readonly onSelectConversation: (conversationId: string | undefined) => void;
  readonly selectedConversationId: string | undefined;
}) => {
  const options = toConversationOptions(conversations, selectedConversationId);
  const selectedOption = findConversationOption(options, selectedConversationId);
  const [comboboxQuery, setComboboxQuery] = useState("");

  const updateComboboxOpen = (open: boolean) => {
    if (open) setComboboxQuery("");
  };

  const selectConversation = (option: ConversationOption | null) => {
    setComboboxQuery("");
    onSelectConversation(toSelectedConversationId(option));
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Combobox<ConversationOption>
        autoHighlight
        disabled={disabled}
        inputValue={comboboxQuery}
        isItemEqualToValue={hasSameConversationValue}
        itemToStringLabel={toConversationOptionLabel}
        itemToStringValue={toConversationOptionValue}
        items={options}
        onInputValueChange={setComboboxQuery}
        onOpenChange={updateComboboxOpen}
        onValueChange={selectConversation}
        value={selectedOption}
      >
        <ComboboxSelectTrigger
          aria-label="Select chat"
          className="w-72 max-w-[56vw]"
          title={selectedOption.label}
        >
          {selectedOption.label}
        </ComboboxSelectTrigger>
        <ComboboxContent align="end" className="max-w-[min(28rem,calc(100vw-2rem))]">
          <div className="border-b border-border p-1">
            <ComboboxInputGroup className="h-8 w-full">
              <ComboboxInput aria-label="Search chats" placeholder="Search chats..." />
            </ComboboxInputGroup>
          </div>
          <ComboboxList>
            {(option: ConversationOption, index) => (
              <ComboboxItem key={option.value} index={index} value={option}>
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
          <ComboboxEmpty>No chats found.</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
      <Button
        aria-label="Start new chat"
        disabled={disabled && selectedConversationId === undefined}
        onClick={onNewConversation}
        size="icon-sm"
        title="Start new chat"
        type="button"
        variant="ghost"
      >
        <PlusIcon className="size-4" />
      </Button>
    </div>
  );
};

type ConversationOption = {
  readonly value: string;
  readonly label: string;
};

const toConversationOptions = (
  conversations: readonly { readonly id: string; readonly title: string }[],
  selectedConversationId: string | undefined,
): readonly ConversationOption[] => {
  const options = [
    { value: NEW_CHAT_VALUE, label: "New chat" },
    ...conversations.map((conversation) => ({
      value: conversation.id,
      label: conversation.title,
    })),
  ];

  if (
    !selectedConversationId ||
    options.some((option) => option.value === selectedConversationId)
  ) {
    return options;
  }

  return [...options, { value: selectedConversationId, label: "Selected chat" }];
};

const findConversationOption = (
  options: readonly ConversationOption[],
  selectedConversationId: string | undefined,
): ConversationOption =>
  options.find((option) => option.value === (selectedConversationId ?? NEW_CHAT_VALUE)) ??
  options[0]!;

const toConversationOptionLabel = (option: ConversationOption): string => option.label;

const toConversationOptionValue = (option: ConversationOption): string => option.value;

const hasSameConversationValue = (
  itemValue: ConversationOption,
  selectedValue: ConversationOption,
): boolean => itemValue.value === selectedValue.value;

const toSelectedConversationId = (option: ConversationOption | null): string | undefined => {
  if (option === null || option.value === NEW_CHAT_VALUE) return undefined;
  return option.value;
};

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

const NEW_CHAT_VALUE = "__side_chat_new_chat__";
