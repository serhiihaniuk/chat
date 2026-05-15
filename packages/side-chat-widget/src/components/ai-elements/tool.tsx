"use client";

import { CheckCircle2, ChevronDown, Clock3, Wrench, XCircle } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { cn } from "../../lib/utils.js";

export type ToolStatus = "running" | "completed" | "error";

export type ToolProps = ComponentProps<"details"> & {
  toolName: string;
  displayName?: string;
  status: ToolStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
};

const statusLabel: Record<ToolStatus, string> = {
  running: "Running",
  completed: "Completed",
  error: "Error",
};

const statusIcon = {
  running: Clock3,
  completed: CheckCircle2,
  error: XCircle,
};

const formatPayload = (value: unknown) =>
  value === undefined ? undefined : JSON.stringify(value, null, 2);

const getReportUrl = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const reportUrl = (value as { reportUrl?: unknown }).reportUrl;
  return typeof reportUrl === "string" ? reportUrl : undefined;
};

export const Tool = ({
  toolName,
  displayName,
  status,
  input,
  output,
  error,
  className,
  ...props
}: ToolProps) => {
  const [open, setOpen] = useState(status === "running");
  const StatusIcon = statusIcon[status];
  const reportUrl = getReportUrl(output);

  useEffect(() => {
    setOpen(status === "running");
  }, [status]);

  return (
    <details
      className={cn(
        "group/tool rounded-md border border-border bg-background text-sm",
        className,
      )}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      {...props}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
        <Wrench aria-hidden="true" className="size-4 text-muted-foreground" />
        <span>{displayName ?? toolName}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground",
            status === "completed" && "text-emerald-700",
            status === "error" && "text-red-700",
          )}
        >
          <StatusIcon aria-hidden="true" className="size-3.5" />
          {statusLabel[status]}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-4 text-muted-foreground transition group-open/tool:rotate-180"
        />
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">
        {formatPayload(input) ? (
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Parameters
            </h4>
            <pre className="overflow-auto rounded border border-border bg-muted/40 p-2 text-xs">
              {formatPayload(input)}
            </pre>
          </section>
        ) : null}
        {!reportUrl && formatPayload(output) ? (
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Result
            </h4>
            <pre className="max-h-56 overflow-auto rounded border border-border bg-muted/40 p-2 text-xs">
              {formatPayload(output)}
            </pre>
          </section>
        ) : null}
        {error ? (
          <p className="m-0 rounded border border-red-200 bg-red-50 p-2 text-red-800">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
};
