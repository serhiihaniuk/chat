import { Loader2 } from "lucide-react";

import type { SideChatError } from "../hooks/use-side-chat.js";

export type ErrorBannerProps = {
  error: SideChatError;
  isStreaming: boolean;
  onRetry: () => void;
};

export const ErrorBanner = ({
  error,
  isStreaming,
  onRetry,
}: ErrorBannerProps) => (
  <div
    role="alert"
    className="mx-auto mt-3 w-[calc(100%-4rem)] max-w-3xl shrink-0 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-base text-red-900 max-sm:w-[calc(100%-2rem)]"
  >
    {error.message}
    {error.retryable ? (
      <button
        type="button"
        className="ml-3 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-800 transition hover:bg-red-100 focus:ring-2 focus:ring-red-500/15 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onRetry}
        disabled={isStreaming}
      >
        Retry
      </button>
    ) : null}
  </div>
);

export const StreamingStatus = () => (
  <div
    className="mx-auto mt-4 flex w-full max-w-3xl shrink-0 items-center gap-2 px-8 text-sm font-medium max-sm:px-4"
    style={{
      color:
        "color-mix(in srgb, var(--sidechat-accent) 82%, var(--sidechat-fg))",
    }}
  >
    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
    <span role="status">Streaming...</span>
  </div>
);
