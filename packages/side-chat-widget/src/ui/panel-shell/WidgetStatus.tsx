import { Loader2, X } from "lucide-react";

import type { SideChatError } from "../../adapters/react/use-side-chat.js";

export type ErrorBannerProps = {
  error: SideChatError;
  isStreaming: boolean;
  onDismiss: () => void;
  onRetry: () => void;
};

export const ErrorBanner = ({
  error,
  isStreaming,
  onDismiss,
  onRetry,
}: ErrorBannerProps) => (
  <div
    role="alert"
    className="mx-auto mt-3 flex w-[calc(100%-4rem)] max-w-3xl shrink-0 items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-base text-red-900 max-sm:w-[calc(100%-2rem)]"
  >
    <span className="min-w-0 flex-1">{error.message}</span>
    <div className="flex shrink-0 items-center gap-2">
      {error.retryable ? (
        <button
          type="button"
          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-800 transition hover:bg-red-100 focus:ring-2 focus:ring-red-500/15 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onRetry}
          disabled={isStreaming}
        >
          Retry
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss error"
        className="inline-flex size-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-800 transition hover:bg-red-100 focus:ring-2 focus:ring-red-500/15 focus:outline-none"
        onClick={onDismiss}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
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
