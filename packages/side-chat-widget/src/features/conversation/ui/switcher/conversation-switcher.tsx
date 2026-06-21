import { Menu } from "@base-ui/react/menu";
import { PlusIcon } from "lucide-react";

import { usePortalContainer } from "#shared/ui/widget-root";
import {
  formatRelativeTime,
  groupConversationsByDate,
  readActiveConversationTitle,
  type ConversationSummaryView,
} from "../../model/conversation-options.js";
import { WidgetHeaderTitle } from "../widget-header-title.js";

export const ConversationSwitcher = ({
  conversations,
  disabled,
  onNewConversation,
  onSelectConversation,
  selectedConversationId,
  title,
}: {
  readonly conversations: readonly ConversationSummaryView[];
  readonly disabled: boolean;
  readonly onNewConversation: () => void;
  readonly onSelectConversation: (conversationId: string | undefined) => void;
  readonly selectedConversationId: string | undefined;
  readonly title: string;
}) => {
  const container = usePortalContainer();
  const activeTitle = readActiveConversationTitle(conversations, selectedConversationId);

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Select chat"
        className="-mx-1 flex min-w-0 items-center rounded-md px-1 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        disabled={disabled}
        title={activeTitle}
      >
        <WidgetHeaderTitle showChevron title={title} />
      </Menu.Trigger>

      <Menu.Portal container={container}>
        <Menu.Positioner align="start" side="bottom" sideOffset={8}>
          <Menu.Popup data-slot="dropdown-menu-content" className="w-menu max-w-full">
            <Menu.Item
              className="flex cursor-pointer select-none items-center gap-2.5 rounded-md p-2.5 text-sm font-medium highlighted:bg-accent"
              onClick={onNewConversation}
            >
              <PlusIcon className="size-4 text-primary" />
              New chat
            </Menu.Item>
            {conversations.length > 0 && (
              <>
                <Menu.Separator className="my-1 h-px bg-border" />
                <div className="max-h-72 overflow-y-auto">
                  {groupConversationsByDate(conversations).map((group) => (
                    <Menu.Group key={group.id}>
                      <Menu.GroupLabel className="px-2.5 pt-1.5 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </Menu.GroupLabel>
                      {group.conversations.map((conversation) => (
                        <SwitcherItem
                          conversation={conversation}
                          isActive={conversation.id === selectedConversationId}
                          key={conversation.id}
                          onSelect={onSelectConversation}
                        />
                      ))}
                    </Menu.Group>
                  ))}
                </div>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

const SwitcherItem = ({
  conversation,
  isActive,
  onSelect,
}: {
  readonly conversation: ConversationSummaryView;
  readonly isActive: boolean;
  readonly onSelect: (conversationId: string | undefined) => void;
}) => (
  <Menu.Item
    className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-2.5 py-2 highlighted:bg-accent"
    onClick={() => onSelect(conversation.id)}
  >
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm text-popover-foreground">{conversation.title}</span>
      <span className="text-xs text-muted-foreground">
        {formatRelativeTime(conversation.lastMessageAt)}
      </span>
    </span>
    {isActive && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
  </Menu.Item>
);
