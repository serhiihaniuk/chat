import type { ReactElement } from "react";

export type ConversationErrorProps = {
  readonly message: string;
  readonly onDismiss?: () => void;
  readonly onRetry?: () => void;
};

export const ConversationError = ({
  message,
  onDismiss,
  onRetry,
}: ConversationErrorProps): ReactElement => (
  <div
    className="side-chat-error ml-[6.5rem] flex max-w-[58rem] items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-lg leading-7 text-red-800"
    role="alert"
  >
    <p>{message}</p>
    <div className="flex gap-2">
      {onRetry ? (
        <button
          className="rounded-md bg-white px-3 py-2"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      ) : null}
      {onDismiss ? (
        <button
          aria-label="Dismiss error"
          className="rounded-md bg-white px-3 py-2"
          onClick={onDismiss}
          type="button"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  </div>
);
