import * as React from "react";

import { cn } from "#shared/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#shared/ui/dialog";
import { InputGroup, InputGroupAddon } from "#shared/ui/input-group";
import { CheckIcon, SearchIcon } from "lucide-react";

type CommandContextValue = {
  readonly query: string;
  readonly reportItemVisibility: (id: string, visible: boolean) => void;
  readonly setQuery: (query: string) => void;
  readonly visibleItemCount: number;
};

const CommandContext = React.createContext<CommandContextValue | null>(null);

function useCommandContext() {
  return React.useContext(CommandContext);
}

function normalizeCommandValue(value: string) {
  return value.trim().toLowerCase();
}

function Command({ className, ...props }: React.ComponentProps<"div">) {
  const [query, setQuery] = React.useState("");
  const [visibilityById, setVisibilityById] = React.useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );

  const reportItemVisibility = React.useCallback((id: string, visible: boolean) => {
    setVisibilityById((current) => {
      if (current.get(id) === visible) {
        return current;
      }
      const next = new Map(current);
      next.set(id, visible);
      return next;
    });
  }, []);

  const visibleItemCount = React.useMemo(
    () => [...visibilityById.values()].filter(Boolean).length,
    [visibilityById],
  );

  const value = React.useMemo<CommandContextValue>(
    () => ({ query, reportItemVisibility, setQuery, visibleItemCount }),
    [query, reportItemVisibility, visibleItemCount],
  );

  return (
    <CommandContext.Provider value={value}>
      <div
        data-slot="command"
        className={cn(
          "flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
          className,
        )}
        {...props}
      />
    </CommandContext.Provider>
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0", className)}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  onChange,
  value,
  ...props
}: React.ComponentProps<"input">) {
  const command = useCommandContext();

  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <input
          data-slot="command-input"
          className={cn(
            "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          onChange={(event) => {
            command?.setQuery(event.currentTarget.value);
            onChange?.(event);
          }}
          value={value}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className,
      )}
      role="listbox"
      {...props}
    />
  );
}

function CommandEmpty({ className, ...props }: React.ComponentProps<"div">) {
  const command = useCommandContext();

  return (
    <div
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm", className)}
      hidden={command ? command.visibleItemCount > 0 : undefined}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  heading,
  children,
  ...props
}: React.ComponentProps<"div"> & { heading?: React.ReactNode }) {
  return (
    <div
      data-slot="command-group"
      className={cn("overflow-hidden p-1 text-foreground", className)}
      role="group"
      {...props}
    >
      {heading ? (
        <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">{heading}</div>
      ) : null}
      {children}
    </div>
  );
}

function CommandSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      role="separator"
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  disabled = false,
  onClick,
  onKeyDown,
  onSelect,
  value,
  ...props
}: Omit<React.ComponentProps<"div">, "onSelect"> & {
  disabled?: boolean;
  onSelect?: (value: string) => void;
  value?: string;
}) {
  const command = useCommandContext();
  const id = React.useId();
  const fallbackValue = React.useMemo(
    () => React.Children.toArray(children).join(" "),
    [children],
  );
  const itemValue = value ?? fallbackValue;
  const reportItemVisibility = command?.reportItemVisibility;
  const matchesQuery =
    !command?.query ||
    normalizeCommandValue(itemValue).includes(normalizeCommandValue(command.query));
  const visible = !disabled && matchesQuery;

  React.useEffect(() => {
    reportItemVisibility?.(id, visible);
    return () => reportItemVisibility?.(id, false);
  }, [id, reportItemVisibility, visible]);

  const selectItem = () => {
    if (!disabled && matchesQuery) {
      onSelect?.(itemValue);
    }
  };

  return (
    <div
      aria-disabled={disabled || undefined}
      data-disabled={disabled ? "true" : undefined}
      data-slot="command-item"
      hidden={!matchesQuery}
      role="option"
      tabIndex={disabled ? undefined : 0}
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          selectItem();
        }
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectItem();
        }
      }}
      {...props}
    >
      {children}
      <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </div>
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-selected/command-item:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
