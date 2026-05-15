"use client";

import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useEffect } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { cn } from "../../lib/utils.js";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="instant"
    resize="instant"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-8 p-4", className)}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{title}</h3>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<"button">;

export type ConversationScrollToBottomSignalProps = {
  signal: number;
};

export const ConversationScrollToBottomSignal = ({
  signal,
}: ConversationScrollToBottomSignalProps) => {
  const { scrollToBottom } = useStickToBottomContext();

  useEffect(() => {
    if (signal === 0) return;

    const frame = requestAnimationFrame(() => {
      void scrollToBottom({
        animation: "instant",
        duration: 600,
        ignoreEscapes: true,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [scrollToBottom, signal]);

  return null;
};

export const ConversationScrollButton = ({
  className,
  children,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  if (isAtBottom) return null;

  return (
    <button
      className={cn(
        "absolute bottom-4 left-1/2 inline-flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-muted focus:ring-2 focus:ring-blue-500/20 focus:outline-none",
        className,
      )}
      onClick={handleScrollToBottom}
      type="button"
      {...props}
    >
      {children ?? <ArrowDownIcon className="size-4" />}
    </button>
  );
};
