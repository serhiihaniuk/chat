/**
 * AI Elements-style conversation shell for Side Chat's rebuilt component layer.
 *
 * Message rendering stays owned by the widget features, while bottom-locking,
 * resize following, and the jump-to-bottom affordance are delegated to
 * `use-stick-to-bottom`, the same primitive family used by AI Elements.
 */
import {
  type ComponentProps,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { ArrowDownIcon } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { Button } from "#shared/ui/button";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({
  className,
  initial = "instant",
  resize = "smooth",
  role = "log",
  ...props
}: ConversationProps): ReactNode => (
  <StickToBottom
    className={cn("relative flex min-h-0 flex-1 overflow-hidden", className)}
    initial={initial}
    resize={resize}
    role={role}
    {...props}
  />
);

type ConversationViewportProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  readonly "data-slot"?: string | undefined;
};

export type ConversationContentProps = ComponentPropsWithoutRef<"div"> & {
  readonly scrollClassName?: string | undefined;
  readonly viewportProps?: ConversationViewportProps | undefined;
};

export const ConversationContent = ({
  className,
  scrollClassName,
  viewportProps,
  ...props
}: ConversationContentProps): ReactNode => {
  const context = useStickToBottomContext();
  const {
    className: viewportClassName,
    style: viewportStyle,
    ...restViewportProps
  } = viewportProps ?? {};

  return (
    <div
      {...restViewportProps}
      className={cn("overflow-y-auto", scrollClassName, viewportClassName)}
      ref={context.scrollRef}
      style={{
        height: "100%",
        overflow: "auto",
        scrollbarGutter: "stable both-edges",
        width: "100%",
        ...viewportStyle,
      }}
    >
      <div
        {...props}
        className={cn("flex flex-col gap-8 p-4", className)}
        ref={context.contentRef}
      />
    </div>
  );
};

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  "aria-label": ariaLabel = "Go to bottom",
  children,
  className,
  onClick,
  ...props
}: ConversationScrollButtonProps): ReactNode => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      void scrollToBottom("instant");
    },
    [onClick, scrollToBottom],
  );

  if (isAtBottom) return null;

  return (
    <Button
      aria-label={ariaLabel}
      className={cn(
        "absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-card",
        className,
      )}
      onClick={handleClick}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <ArrowDownIcon className="size-4" />}
    </Button>
  );
};

export const ConversationFollowTrigger = ({
  followKey,
}: {
  readonly followKey: string | undefined;
}): null => {
  const { scrollToBottom } = useStickToBottomContext();
  const previousFollowKeyRef = useRef<string | undefined>(followKey);

  useLayoutEffect(() => {
    if (!followKey || followKey === previousFollowKeyRef.current) {
      previousFollowKeyRef.current = followKey;
      return;
    }

    previousFollowKeyRef.current = followKey;
    void scrollToBottom("instant");
  }, [followKey, scrollToBottom]);

  return null;
};
