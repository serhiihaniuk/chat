import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  usePromptInputAttachments,
} from "#shared/ai/prompt-input";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "#shared/ui/dropdown-menu";
import { cn } from "#shared/lib/cn";
import {
  CheckIcon,
  FileIcon,
  ImageIcon,
  LinkIcon,
  PaperclipIcon,
  SearchIcon,
  TerminalIcon,
} from "lucide-react";
import { useState } from "react";

const SCOPE_OPTIONS = ["This page", "Selection", "Whole workspace"] as const;
type ScopeOption = (typeof SCOPE_OPTIONS)[number];

// Roomier rows than the default menu item, matching the composer-menu mock
// (≈8px/9px padding, 11px gap, 13px text, 16px icons).
const MENU_ITEM_CLASS = "gap-[0.6875rem] px-[0.5625rem] py-2 text-[0.8125rem]";
const MENU_LABEL_CLASS = "px-[0.5625rem] pt-1.5 pb-1 text-[0.656rem] font-semibold uppercase tracking-[0.07em]";

// The composer "+" menu. Attach/screenshot drive the real attachment input; the tool
// toggles and context-scope selection are composer-local controls that mirror the
// design until they are wired to runtime capabilities.
export const ComposerActions = () => {
  const attachments = usePromptInputAttachments();
  const [webSearch, setWebSearch] = useState(false);
  const [codeInterpreter, setCodeInterpreter] = useState(false);
  const [scope, setScope] = useState<ScopeOption>("This page");

  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger
        aria-label="Add context and tools"
        className="sc-composer-add size-8 rounded-full border border-border text-muted-foreground"
      />
      <PromptInputActionMenuContent className="w-64 p-1.5" side="top">
        <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={() => attachments.openFileDialog()}>
          <PaperclipIcon className="text-muted-foreground" />
          Attach file
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM_CLASS} onClick={() => attachments.openFileDialog()}>
          <ImageIcon className="text-muted-foreground" />
          Add screenshot
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM_CLASS}>
          <LinkIcon className="text-muted-foreground" />
          Add link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className={MENU_LABEL_CLASS}>Tools</DropdownMenuLabel>
          <ToolToggleItem
            checked={webSearch}
            icon={<SearchIcon className="text-muted-foreground" />}
            label="Web search"
            onToggle={() => setWebSearch((value) => !value)}
          />
          <ToolToggleItem
            checked={codeInterpreter}
            icon={<TerminalIcon className="text-muted-foreground" />}
            label="Code interpreter"
            onToggle={() => setCodeInterpreter((value) => !value)}
          />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className={cn(MENU_LABEL_CLASS, "flex items-center justify-between")}>
            Context scope
            <span className="size-1.5 rounded-full bg-success ring-2 ring-success/20" />
          </DropdownMenuLabel>
          {SCOPE_OPTIONS.map((option) => (
            <DropdownMenuItem
              className={MENU_ITEM_CLASS}
              closeOnClick={false}
              key={option}
              onClick={() => setScope(option)}
            >
              <FileIcon className="text-muted-foreground" />
              <span className="flex-1">{option}</span>
              {option === scope && <CheckIcon className="text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
};

const ToolToggleItem = ({
  checked,
  icon,
  label,
  onToggle,
}: {
  readonly checked: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onToggle: () => void;
}) => (
  <DropdownMenuItem className={MENU_ITEM_CLASS} closeOnClick={false} onClick={onToggle}>
    {icon}
    <span className="flex-1">{label}</span>
    <span
      className={cn(
        "flex h-[1.125rem] w-8 items-center rounded-full p-0.5 transition-colors",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "size-3.5 rounded-full bg-background shadow-sm transition-transform",
          checked && "translate-x-3.5",
        )}
      />
    </span>
  </DropdownMenuItem>
);
