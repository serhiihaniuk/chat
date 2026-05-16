"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import {
  memo,
  type ComponentProps,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import { Streamdown } from "streamdown";
import { cn } from "../../lib/utils.js";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

const userMessageStyle = {
  background: "color-mix(in srgb, var(--sidechat-accent, #2563eb) 12%, white)",
  borderColor:
    "color-mix(in srgb, var(--sidechat-accent, #2563eb) 28%, white)",
} satisfies CSSProperties;

export const MessageContent = ({
  children,
  className,
  "data-message-from": messageFrom,
  ...props
}: MessageContentProps & { "data-message-from"?: UIMessage["role"] }) => (
  <div
    className={cn(
      "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-base break-words",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:border group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className,
    )}
    data-message-from={messageFrom}
    style={messageFrom === "user" ? userMessageStyle : undefined}
    {...props}
  >
    {children}
  </div>
);

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full min-w-0 overflow-wrap-anywhere break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_p]:overflow-wrap-anywhere [&_pre]:max-w-full [&_pre]:overflow-x-auto",
        className,
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
