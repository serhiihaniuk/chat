import type { ReactElement } from "react";

import type { QuickAction } from "../model/quick-action.js";
import { resolveQuickActionSelection } from "../model/quick-action-resolver.js";

export type QuickActionsRowProps = {
  readonly actions?: readonly QuickAction[];
  readonly disabled?: boolean;
  readonly onSelect?: (prompt: string) => void;
};

export const QuickActionsRow = ({
  actions = [],
  disabled = false,
  onSelect,
}: QuickActionsRowProps): ReactElement | null => {
  if (actions.length === 0) return null;

  return (
    <div
      aria-label="Suggested actions"
      className="side-chat-quick-actions flex flex-none gap-3.5 overflow-x-auto px-16 pt-2.5 pb-4 max-[720px]:px-5"
    >
      {actions.map((action) => {
        const selection = resolveQuickActionSelection(action);
        const isDisabled =
          disabled || !onSelect || selection.status === "ignored";

        return (
          <button
            className="side-chat-chip side-chat-chip--action inline-flex min-h-10 min-w-36 items-center justify-center rounded-lg border border-emerald-300 bg-white px-5 text-lg leading-none whitespace-nowrap text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            disabled={isDisabled}
            key={action.id}
            onClick={() => {
              if (!isDisabled && selection.status === "selected") {
                onSelect?.(selection.prompt);
              }
            }}
            type="button"
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
};
