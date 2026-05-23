import type { HTMLAttributes, ReactElement } from "react";

import { cn } from "#shared/lib/cn";

export type ConversationProps = HTMLAttributes<HTMLElement>;
export type ConversationContentProps = HTMLAttributes<HTMLDivElement>;

export const Conversation = ({
  className,
  ...props
}: ConversationProps): ReactElement => (
  <section
    aria-label="Conversation"
    className={cn("min-h-0 flex-1 overflow-hidden", className)}
    {...props}
  />
);

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps): ReactElement => (
  <div
    className={cn(
      "flex h-full flex-col gap-5 overflow-y-auto px-8 py-6",
      className,
    )}
    {...props}
  />
);

export const ConversationEmptyState = ({
  className,
  description,
  title,
  ...props
}: ConversationContentProps & {
  readonly description: string;
  readonly title: string;
}): ReactElement => (
  <div
    className={cn(
      "flex h-full flex-col items-center justify-center gap-2 text-center text-slate-500",
      className,
    )}
    {...props}
  >
    <p className="text-xl font-semibold text-slate-800">{title}</p>
    <p className="max-w-sm text-base leading-6">{description}</p>
  </div>
);
