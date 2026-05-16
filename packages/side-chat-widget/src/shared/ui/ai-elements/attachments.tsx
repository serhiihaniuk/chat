"use client";

import {
  Download,
  ExternalLink,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, type ComponentProps } from "react";
import { cn } from "../../lib/utils.js";

export type AttachmentData = {
  id: string;
  name: string;
  url: string;
  mediaType?: string;
  size?: number;
};

const AttachmentContext = createContext<AttachmentData | undefined>(undefined);

const useAttachment = () => {
  const attachment = useContext(AttachmentContext);
  if (!attachment) {
    throw new Error("Attachment subcomponents must be used inside Attachment.");
  }

  return attachment;
};

const formatBytes = (value?: number) => {
  if (!value) return undefined;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export type AttachmentsProps = ComponentProps<"div"> & {
  variant?: "inline" | "list";
};

export const Attachments = ({
  className,
  variant = "list",
  ...props
}: AttachmentsProps) => (
  <div
    className={cn(
      "flex gap-2",
      variant === "list" ? "flex-col" : "flex-row flex-wrap",
      className,
    )}
    {...props}
  />
);

export type AttachmentProps = ComponentProps<"a"> & {
  data: AttachmentData;
};

export const Attachment = ({
  className,
  data,
  href,
  target = "_blank",
  rel = "noreferrer",
  children,
  ...props
}: AttachmentProps) => (
  <AttachmentContext.Provider value={data}>
    <a
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2 text-sm text-foreground shadow-sm transition focus:ring-2 focus:outline-none",
        className,
      )}
      style={{
        background: "var(--sidechat-bg, white)",
        borderColor: "color-mix(in srgb, var(--sidechat-accent, #2563eb) 32%, var(--sidechat-border, #e2e8f0))",
        outlineColor: "var(--sidechat-accent, #2563eb)",
      }}
      href={href ?? data.url}
      rel={rel}
      target={target}
      {...props}
    >
      {children}
    </a>
  </AttachmentContext.Provider>
);

export type AttachmentPreviewProps = ComponentProps<"span"> & {
  icon?: LucideIcon;
};

export const AttachmentPreview = ({
  className,
  icon: Icon = FileText,
  ...props
}: AttachmentPreviewProps) => (
  <span
    className={cn(
      "inline-flex size-10 shrink-0 items-center justify-center rounded border",
      className,
    )}
    style={{
      background: "color-mix(in srgb, var(--sidechat-accent, #2563eb) 10%, white)",
      borderColor: "color-mix(in srgb, var(--sidechat-accent, #2563eb) 28%, white)",
      color: "var(--sidechat-accent, #2563eb)",
    }}
    {...props}
  >
    <Icon aria-hidden="true" className="size-5" />
  </span>
);

export const AttachmentInfo = ({
  className,
  ...props
}: ComponentProps<"span">) => {
  const attachment = useAttachment();
  const size = formatBytes(attachment.size);

  return (
    <span className={cn("min-w-0 flex-1", className)} {...props}>
      <span className="block truncate font-semibold">{attachment.name}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {[attachment.mediaType ?? "Document", size].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
};

export const AttachmentAction = ({
  className,
  ...props
}: ComponentProps<"span">) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center gap-2 text-sm font-semibold",
      className,
    )}
    style={{ color: "var(--sidechat-accent, #2563eb)" }}
    {...props}
  >
    <Download aria-hidden="true" className="size-4" />
    Open
    <ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground" />
  </span>
);
