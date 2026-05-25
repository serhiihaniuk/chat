import type { ReactElement } from "react";

import type { QuickAction, QuickActionIcon } from "../model/quick-action.js";
import { resolveQuickActionSelection } from "../model/quick-action-resolver.js";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  DatabaseIcon,
  FileTextIcon,
  ListChecksIcon,
  TrophyIcon,
} from "#shared/assets/icons/panel-icons";

export type QuickActionsRowProps = {
  readonly actions?: readonly QuickAction[];
  readonly disabled?: boolean;
  readonly onSelect?: (prompt: string, displayContent?: string) => void;
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
      className="side-chat-quick-actions flex flex-none gap-4 overflow-x-auto px-16 pt-2.5 pb-4 max-[720px]:gap-2 max-[720px]:px-5"
    >
      {actions.map((action) => {
        const selection = resolveQuickActionSelection(action);
        const isDisabled =
          disabled || !onSelect || selection.status === "ignored";

        return (
          <button
            className="side-chat-chip side-chat-chip--action inline-flex min-h-16 items-center justify-center gap-4 rounded-lg border border-emerald-300 bg-white px-6 text-[1.75rem] leading-none font-normal whitespace-nowrap text-emerald-950 shadow-none transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 max-[720px]:min-h-11 max-[720px]:gap-2 max-[720px]:px-3 max-[720px]:text-base [&_svg]:size-8 [&_svg]:stroke-emerald-600 max-[720px]:[&_svg]:size-5"
            disabled={isDisabled}
            key={action.id}
            onClick={() => {
              if (!isDisabled && selection.status === "selected") {
                onSelect?.(selection.prompt, selection.displayContent);
              }
            }}
            type="button"
          >
            <QuickActionGlyph icon={action.icon} />
            {action.label}
          </button>
        );
      })}
    </div>
  );
};

const QuickActionGlyph = ({
  icon,
}: {
  readonly icon: QuickActionIcon | undefined;
}): ReactElement => {
  if (icon === undefined) return <ListChecksIcon />;

  switch (icon) {
    case "calendar":
      return <CalendarClockIcon />;
    case "database":
      return <DatabaseIcon />;
    case "file":
      return <FileTextIcon />;
    case "trophy":
      return <TrophyIcon />;
    case "warning":
      return <AlertTriangleIcon />;
    case "list":
      return <ListChecksIcon />;
  }
};
