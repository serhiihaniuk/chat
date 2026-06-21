import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { createContext, useContext } from "react";

import { cn } from "#shared/lib/cn";

type HoverCardDelayContextValue = {
  readonly closeDelay: number | undefined;
  readonly openDelay: number | undefined;
};

const HoverCardDelayContext = createContext<HoverCardDelayContextValue>({
  closeDelay: undefined,
  openDelay: undefined,
});

type HoverCardProps = PreviewCardPrimitive.Root.Props & {
  readonly closeDelay?: number;
  readonly openDelay?: number;
};

function HoverCard({ closeDelay, openDelay, ...props }: HoverCardProps) {
  return (
    <HoverCardDelayContext.Provider value={{ closeDelay, openDelay }}>
      <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />
    </HoverCardDelayContext.Provider>
  );
}

function HoverCardTrigger({ ...props }: PreviewCardPrimitive.Trigger.Props) {
  const delays = useContext(HoverCardDelayContext);

  return (
    <PreviewCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      closeDelay={props.closeDelay ?? delays.closeDelay}
      delay={props.delay ?? delays.openDelay}
      {...props}
    />
  );
}

function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 4,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<PreviewCardPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal">
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "z-50 w-64 origin-(--transform-origin) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-(--shadow-popover) ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
