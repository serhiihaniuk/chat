"use client";

import { Brain, ChevronDown } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { cn } from "../../lib/utils.js";

export type ReasoningProps = ComponentProps<"details"> & {
  isStreaming?: boolean;
};

export const Reasoning = ({
  className,
  isStreaming = false,
  children,
  ...props
}: ReasoningProps) => {
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    setOpen(isStreaming);
  }, [isStreaming]);

  return (
    <details
      className={cn(
        "group/reasoning mb-3 rounded-md border px-3 py-2 text-sm",
        className,
      )}
      style={{
        background: "color-mix(in srgb, var(--sidechat-accent, #2563eb) 7%, white)",
        borderColor: "color-mix(in srgb, var(--sidechat-accent, #2563eb) 24%, var(--sidechat-border, #e2e8f0))",
        color: "color-mix(in srgb, var(--sidechat-fg, #0f172a) 70%, var(--sidechat-accent, #2563eb))",
      }}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      {...props}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
        <Brain aria-hidden="true" className="size-4" />
        <span>{isStreaming ? "Thinking..." : "Reasoning"}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition group-open/reasoning:rotate-180"
        />
      </summary>
      <div className="mt-3 whitespace-pre-wrap leading-6">{children}</div>
    </details>
  );
};
