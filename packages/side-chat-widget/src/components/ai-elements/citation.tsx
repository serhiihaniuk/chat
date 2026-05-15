"use client";

import { ExternalLink } from "lucide-react";
import type { ComponentProps } from "react";
import type { CitationSource } from "@side-chat/shared-protocol";
import { cn } from "../../lib/utils.js";

export type { CitationSource };

export type CitationProps = ComponentProps<"button"> & {
  source: CitationSource;
};

export const citationSelectedEventName = "sidechat:citation-selected";

export const Citation = ({
  source,
  className,
  children,
  onClick,
  ...props
}: CitationProps) => (
  <button
    type="button"
    className={cn(
      "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:bg-muted focus:ring-2 focus:outline-none",
      className,
    )}
    style={{
      borderColor:
        "color-mix(in srgb, var(--sidechat-accent, #2563eb) 35%, var(--sidechat-border, #e2e8f0))",
      color:
        "color-mix(in srgb, var(--sidechat-accent, #2563eb) 78%, var(--sidechat-fg, #0f172a))",
    }}
    onClick={(event) => {
      window.dispatchEvent(
        new CustomEvent(citationSelectedEventName, { detail: source }),
      );
      onClick?.(event);
    }}
    {...props}
  >
    <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
    <span className="truncate">{children ?? source.label}</span>
  </button>
);

export type CitationsProps = ComponentProps<"div"> & {
  sources: CitationSource[];
};

export const Citations = ({
  sources,
  className,
  ...props
}: CitationsProps) => {
  if (sources.length === 0) return null;

  return (
    <div
      className={cn("inline-flex flex-wrap items-center gap-1.5", className)}
      aria-label="Answer sources"
      {...props}
    >
      {sources.map((source) => (
        <Citation key={source.sourceId} source={source} />
      ))}
    </div>
  );
};
