"use client";

import { Badge } from "#shared/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#shared/ui/collapsible";
import { cn } from "#shared/lib/cn";
import {
  BrainIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ImageIcon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react";
import { type ComponentProps, type ReactNode } from "react";

export type ChainOfThoughtProps = ComponentProps<typeof Collapsible>;

export const ChainOfThought = ({ className, ...props }: ChainOfThoughtProps) => (
  <Collapsible className={cn("group/chain not-prose w-full", className)} {...props} />
);

export type ChainOfThoughtHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  title?: ReactNode;
};

export const ChainOfThoughtHeader = ({
  className,
  title = "Chain of Thought",
  ...props
}: ChainOfThoughtHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-4 rounded-md py-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
      className,
    )}
    {...props}
  >
    <span className="flex items-center gap-2">
      <BrainIcon className="size-4" />
      {title}
    </span>
    <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]/chain:rotate-180" />
  </CollapsibleTrigger>
);

export type ChainOfThoughtContentProps = ComponentProps<typeof CollapsibleContent>;

export const ChainOfThoughtContent = ({ className, ...props }: ChainOfThoughtContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-4 pt-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
);

export type ChainOfThoughtStepStatus = "pending" | "running" | "completed" | "failed";

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  readonly icon?: LucideIcon;
  readonly status?: ChainOfThoughtStepStatus;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly sources?: readonly string[];
};

const statusStyles: Record<ChainOfThoughtStepStatus, string> = {
  completed: "text-muted-foreground",
  failed: "text-destructive",
  pending: "text-muted-foreground",
  running: "text-foreground",
};

const statusLabels: Record<ChainOfThoughtStepStatus, string> = {
  completed: "Completed",
  failed: "Error",
  pending: "Pending",
  running: "Running",
};

export const ChainOfThoughtStep = ({
  children,
  className,
  description,
  icon: Icon = CircleIcon,
  sources = [],
  status = "completed",
  title,
  ...props
}: ChainOfThoughtStepProps) => (
  <div className={cn("grid grid-cols-[1rem_1fr] gap-x-4 text-sm", className)} {...props}>
    <div className="flex flex-col items-center pt-1">
      <Icon className={cn("size-3.5", statusStyles[status])} />
      {(children || description || sources.length > 0) && (
        <span className="mt-2 h-full min-h-5 w-px bg-border" />
      )}
    </div>
    <div className="space-y-2 pb-3">
      <div
        className={cn(
          "font-medium text-foreground",
          status === "completed" && "text-muted-foreground",
          status === "failed" && "text-destructive",
        )}
      >
        {title}
      </div>
      <span className="sr-only">{statusLabels[status]}</span>
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sources.map((source) => (
            <Badge key={source} variant="secondary">
              {source}
            </Badge>
          ))}
        </div>
      )}
      {description && (
        <div className="max-w-prose text-muted-foreground leading-6">{description}</div>
      )}
      {children && <div className="space-y-3">{children}</div>}
    </div>
  </div>
);

export const chainOfThoughtIcons = {
  check: CheckCircleIcon,
  image: ImageIcon,
  search: SearchIcon,
} as const;
