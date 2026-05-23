import type { HTMLAttributes, ReactElement } from "react";

import { cn } from "#shared/lib/cn";

export type MessageRole = "assistant" | "system" | "user";

export type MessageProps = HTMLAttributes<HTMLElement> & {
  readonly from: MessageRole;
};

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const Message = ({
  className,
  from,
  ...props
}: MessageProps): ReactElement => (
  <article
    className={cn(
      "grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4",
      className,
    )}
    data-from={from}
    {...props}
  />
);

export const MessageRoleLabel = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>): ReactElement => (
  <span
    className={cn("text-lg font-medium leading-8 text-slate-500", className)}
    {...props}
  >
    {children}
  </span>
);

export const MessageContent = ({
  className,
  ...props
}: MessageContentProps): ReactElement => (
  <div
    className={cn(
      "max-w-[58rem] whitespace-pre-wrap text-[1.625rem] leading-[1.45] tracking-normal text-slate-900",
      className,
    )}
    {...props}
  />
);

export const MessageResponse = ({
  className,
  ...props
}: MessageContentProps): ReactElement => (
  <MessageContent className={cn("text-slate-950", className)} {...props} />
);
