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

export type ChainOfThoughtStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "active"
  | "complete";
type NormalizedChainOfThoughtStepStatus = "pending" | "running" | "completed" | "failed";

export type ChainOfThoughtStepProps = Omit<ComponentProps<"div">, "title"> & {
  readonly icon?: LucideIcon;
  readonly status?: ChainOfThoughtStepStatus;
  readonly title?: ReactNode;
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  readonly sources?: readonly string[];
};

const statusStyles: Record<NormalizedChainOfThoughtStepStatus, string> = {
  completed: "text-muted-foreground",
  failed: "text-destructive",
  pending: "text-muted-foreground",
  running: "text-foreground",
};

const statusLabels: Record<NormalizedChainOfThoughtStepStatus, string> = {
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
  label,
  sources = [],
  status = "completed",
  title,
  ...props
}: ChainOfThoughtStepProps) => {
  const normalizedStatus = normalizeStepStatus(status);
  const titleContent = title ?? label;
  return (
    <div className={cn("grid grid-cols-[1rem_1fr] gap-x-4 text-sm", className)} {...props}>
      <StepMarker
        hasTail={hasStepTail({ children, description, sources })}
        icon={Icon}
        status={normalizedStatus}
      />
      <div className="space-y-2 pb-3">
        <div className={stepTitleClassName(normalizedStatus)}>{titleContent}</div>
        <span className="sr-only">{statusLabels[normalizedStatus]}</span>
        <StepSources sources={sources} />
        <StepDescription description={description} />
        <StepChildren>{children}</StepChildren>
      </div>
    </div>
  );
};

const StepMarker = ({
  hasTail,
  icon: Icon,
  status,
}: {
  readonly hasTail: boolean;
  readonly icon: LucideIcon;
  readonly status: NormalizedChainOfThoughtStepStatus;
}) => (
  <div className="flex flex-col items-center pt-1">
    <Icon className={cn("size-3.5", statusStyles[status])} />
    {hasTail && <span className="mt-2 h-full min-h-5 w-px bg-border" />}
  </div>
);

const StepSources = ({ sources }: { readonly sources: readonly string[] }) => {
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((source) => (
        <Badge key={source} variant="secondary">
          {source}
        </Badge>
      ))}
    </div>
  );
};

const StepDescription = ({ description }: { readonly description: ReactNode }) => {
  if (!description) return null;
  return <div className="max-w-prose text-muted-foreground leading-6">{description}</div>;
};

const StepChildren = ({ children }: { readonly children: ReactNode }) => {
  if (!children) return null;
  return <div className="space-y-3">{children}</div>;
};

const hasStepTail = ({
  children,
  description,
  sources,
}: {
  readonly children: ReactNode;
  readonly description: ReactNode;
  readonly sources: readonly string[];
}): boolean => Boolean(children || description || sources.length > 0);

const stepTitleClassName = (status: NormalizedChainOfThoughtStepStatus): string =>
  cn(
    "font-medium text-foreground",
    status === "completed" && "text-muted-foreground",
    status === "failed" && "text-destructive",
  );

export type ChainOfThoughtSearchResultsProps = ComponentProps<"div">;

export const ChainOfThoughtSearchResults = ({
  className,
  ...props
}: ChainOfThoughtSearchResultsProps) => (
  <div className={cn("flex flex-wrap gap-2", className)} {...props} />
);

export type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge>;

export const ChainOfThoughtSearchResult = ({
  className,
  variant = "secondary",
  ...props
}: ChainOfThoughtSearchResultProps) => (
  <Badge className={cn("max-w-full truncate", className)} variant={variant} {...props} />
);

export type ChainOfThoughtImageProps = ComponentProps<"figure"> & {
  readonly caption?: ReactNode;
};

export const ChainOfThoughtImage = ({
  caption,
  children,
  className,
  ...props
}: ChainOfThoughtImageProps) => (
  <figure className={cn("space-y-2", className)} {...props}>
    {children}
    {caption && <figcaption className="text-muted-foreground text-xs">{caption}</figcaption>}
  </figure>
);

const normalizeStepStatus = (
  status: ChainOfThoughtStepStatus,
): NormalizedChainOfThoughtStepStatus => {
  if (status === "active") return "running";
  if (status === "complete") return "completed";
  return status;
};

export const chainOfThoughtIcons = {
  check: CheckCircleIcon,
  image: ImageIcon,
  search: SearchIcon,
} as const;
