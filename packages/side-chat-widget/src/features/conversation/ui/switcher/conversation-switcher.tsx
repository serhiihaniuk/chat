import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#shared/ui/dropdown-menu";
import { PlusIcon } from "lucide-react";

import {
  formatRelativeTime,
  groupConversationsByDate,
  readActiveConversationTitle,
  type ConversationSummaryView,
} from "../../model/conversation-options.js";
import { WidgetHeaderTitle } from "../widget-header-title.js";

// Narrow-mode conversation switcher anchored to the panel title. The widget name
// stays the visible label; the trigger's title attribute reflects the active
// conversation so it reads as a tooltip and stays inspectable. In wide mode the
// sidebar replaces this control.
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
  const activeTitle = readActiveConversationTitle(conversations, selectedConversationId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Select chat"
        className="-mx-1 flex min-w-0 items-center rounded-md px-1 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        disabled={disabled}
        title={activeTitle}
      >
        <WidgetHeaderTitle showChevron title={title} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[17.625rem] max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border p-1.5 shadow-xl ring-0"
      >
        <DropdownMenuItem
          className="gap-2.5 p-2.5 font-medium text-[0.84375rem]"
          onClick={onNewConversation}
        >
          <PlusIcon className="size-4 text-primary" />
          New chat
        </DropdownMenuItem>
        {conversations.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {/* Date-grouped, capped then scrollable. Each label stays inside its own
                group (Base UI requires it) so the menu doesn't crash. */}
            <div className="max-h-72 overflow-y-auto">
              {groupConversationsByDate(conversations).map((group) => (
                <DropdownMenuGroup key={group.id}>
                  <DropdownMenuLabel className="px-2.5 pt-1.5 pb-[7px] font-semibold text-[0.65625rem] uppercase tracking-[0.08em]">
                    {group.label}
                  </DropdownMenuLabel>
                  {group.conversations.map((conversation) => (
                    <SwitcherItem
                      conversation={conversation}
                      isActive={conversation.id === selectedConversationId}
                      key={conversation.id}
                      onSelect={onSelectConversation}
                    />
                  ))}
                </DropdownMenuGroup>
              ))}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  <DropdownMenuItem
    className="justify-between gap-2 px-2.5 py-[0.5625rem]"
    onClick={() => onSelect(conversation.id)}
  >
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-[0.84375rem] text-popover-foreground leading-5">
        {conversation.title}
      </span>
      <span className="text-[0.71875rem] text-muted-foreground leading-4">
        {formatRelativeTime(conversation.lastMessageAt)}
      </span>
    </span>
    {isActive && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
  </DropdownMenuItem>
);
