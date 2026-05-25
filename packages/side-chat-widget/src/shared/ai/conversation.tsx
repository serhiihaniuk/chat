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
      "flex h-full flex-col gap-6 overflow-y-auto px-8 py-6 max-[720px]:px-5",
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
      "flex h-full flex-col items-center justify-center gap-4 text-center text-slate-500",
      className,
    )}
    {...props}
  >
    <p className="text-[1.75rem] leading-tight font-semibold text-slate-500 max-[720px]:text-xl">
      {title}
    </p>
    <p className="max-w-4xl text-[1.75rem] leading-tight text-slate-500 max-[720px]:max-w-sm max-[720px]:text-base">
      {description}
    </p>
  </div>
);
