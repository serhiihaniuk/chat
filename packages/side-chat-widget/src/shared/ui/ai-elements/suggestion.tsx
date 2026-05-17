"use client";

import { type ComponentProps } from "react";
import { cn } from "../../lib/utils.js";

export type SuggestionsProps = ComponentProps<"div">;

export const Suggestions = ({ className, ...props }: SuggestionsProps) => (
  <div
    className={cn(
      "sidechat-scrollbar-none flex shrink-0 items-center gap-3 overflow-x-auto py-1",
      className,
    )}
    {...props}
  />
);

export type SuggestionProps = ComponentProps<"button">;

export const Suggestion = ({
  className,
  type = "button",
  ...props
}: SuggestionProps) => (
  <button
    className={cn(
      "inline-flex h-12 shrink-0 items-center gap-3 rounded-full border px-5 text-base font-semibold shadow-sm transition focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 max-sm:h-10 max-sm:px-3 max-sm:text-sm [&_svg]:size-5",
      className,
    )}
    style={{
      background: "var(--sidechat-bg, white)",
      borderColor: "color-mix(in srgb, var(--sidechat-accent, #2563eb) 28%, var(--sidechat-border, #e2e8f0))",
      color: "var(--sidechat-fg, #334155)",
      outlineColor: "var(--sidechat-accent, #2563eb)",
    }}
    type={type}
    {...props}
  />
);
