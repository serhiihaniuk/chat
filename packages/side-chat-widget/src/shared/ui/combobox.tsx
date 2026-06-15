import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";

import { cn } from "#shared/lib/cn";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

const Combobox = ComboboxPrimitive.Root;

function ComboboxInputGroup({ className, ...props }: ComboboxPrimitive.InputGroup.Props) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        "flex h-7 min-w-0 items-center rounded-md border border-input bg-background text-xs outline-none transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "min-w-0 flex-1 bg-transparent px-2 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxTrigger({ className, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "flex h-full shrink-0 items-center px-1.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-3.5" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxSelectTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-select-trigger"
      className={cn(
        "flex h-7 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-44 overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("max-h-72 overflow-y-auto p-1 outline-none", className)}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ComboboxPrimitive.ItemIndicator
        keepMounted
        className="pointer-events-none absolute right-2 flex size-4 items-center justify-center opacity-0 data-selected:opacity-100"
      >
        <CheckIcon className="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, children, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("text-center text-muted-foreground text-sm", className)}
      {...props}
    >
      <span className="block px-2 py-6">{children}</span>
    </ComboboxPrimitive.Empty>
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxSelectTrigger,
  ComboboxTrigger,
};
