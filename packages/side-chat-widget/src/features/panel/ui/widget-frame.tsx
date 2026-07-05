import { useWidgetLabels } from "#shared/lib/widget-labels";
import { Button, IconButton } from "#shared/ui/button";
import { PlusIcon, RefreshCwIcon, SettingsIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

export const ClosedWidgetLauncher = ({
  label,
  onOpen,
}: {
  readonly label: string;
  readonly onOpen: () => void;
}) => (
  <Button
    className="fixed right-4 bottom-4 z-50 gap-2 shadow-(--shadow-panel)"
    onClick={onOpen}
    type="button"
  >
    {label}
  </Button>
);

// The leading title region is a plain title in wide mode or a caller-supplied
// switcher control in narrow mode. Resize chrome lives beside this header.
export const WidgetHeader = ({
  onClose,
  onNewConversation,
  newConversationDisabled = false,
  onOpenSettings,
  onRefresh,
  title,
}: {
  readonly onClose: () => void;
  readonly onNewConversation: () => void;
  readonly newConversationDisabled?: boolean | undefined;
  readonly onOpenSettings: () => void;
  /** Manual catch-up: re-read the current conversation from the server. */
  readonly onRefresh?: (() => void) | undefined;
  readonly title: ReactNode;
}) => {
  const labels = useWidgetLabels();
  return (
    <header className="sc-header">
      <div className="flex min-w-0 flex-1 items-center">{title}</div>
      {onRefresh ? (
        <IconButton
          aria-label={labels.headerRefresh}
          onClick={onRefresh}
          title={labels.headerRefresh}
          type="button"
        >
          <RefreshCwIcon className="size-4" />
        </IconButton>
      ) : null}
      <IconButton aria-label={labels.headerSettings} onClick={onOpenSettings} type="button">
        <SettingsIcon className="size-4" />
      </IconButton>
      <IconButton
        aria-label={labels.headerNewChat}
        disabled={newConversationDisabled}
        onClick={onNewConversation}
        title={labels.headerNewChat}
        type="button"
      >
        <PlusIcon className="size-4" />
      </IconButton>
      <IconButton aria-label={labels.headerClose} onClick={onClose} type="button">
        <XIcon className="size-4" />
      </IconButton>
    </header>
  );
};
