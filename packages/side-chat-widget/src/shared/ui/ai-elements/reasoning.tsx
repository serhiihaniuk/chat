"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { cn } from "../../lib/utils.js";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "./chain-of-thought.js";

export type ReasoningProps = ComponentProps<"div"> & {
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
    <ChainOfThought
      className={cn(
        "rounded-md border px-2.5 py-[3px] text-sm",
        className,
      )}
      defaultOpen={isStreaming}
      onOpenChange={setOpen}
      open={open}
      style={{
        background:
          "color-mix(in srgb, var(--sidechat-accent, #2563eb) 7%, white)",
        borderColor:
          "color-mix(in srgb, var(--sidechat-accent, #2563eb) 24%, var(--sidechat-border, #e2e8f0))",
        color:
          "color-mix(in srgb, var(--sidechat-fg, #0f172a) 70%, var(--sidechat-accent, #2563eb))",
      }}
      {...props}
    >
      <ChainOfThoughtHeader className="font-medium">
        {isStreaming ? "Thinking..." : "Reasoning"}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtStep
          label={<div className="whitespace-pre-wrap leading-5">{children}</div>}
          status={isStreaming ? "active" : "complete"}
        />
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
};
