import type { ReactElement } from "react";

import {
  CloseIcon,
  ExpandIcon,
  NewChatIcon,
  SettingsIcon,
} from "#shared/assets/icons/panel-icons";
import { IconButton } from "#shared/ui/icon-button";
import type { PanelHeaderActions } from "../model/panel-actions.js";

export type PanelHeaderProps = {
  readonly actions?: PanelHeaderActions;
  readonly title: string;
};

export const PanelHeader = ({
  actions = {},
  title,
}: PanelHeaderProps): ReactElement => (
  <header className="side-chat-widget__header flex items-center justify-between gap-5 px-8 pt-12 pb-7 max-[720px]:px-5 max-[720px]:pt-6 max-[720px]:pb-4">
    <h2 className="m-0 text-3xl leading-tight font-bold tracking-normal text-emerald-950 max-[720px]:text-2xl">
      {title}
    </h2>
    <div
      aria-label="Panel controls"
      className="side-chat-widget__actions flex items-center gap-6 text-slate-500 max-[720px]:gap-1"
    >
      <IconButton
        disabled={!actions.onNewChat}
        icon={<NewChatIcon />}
        label="New chat"
        onClick={actions.onNewChat}
      />
      <IconButton
        disabled={!actions.onOpenSettings}
        icon={<SettingsIcon />}
        label="Settings"
        onClick={actions.onOpenSettings}
      />
      <IconButton
        disabled={!actions.onToggleExpanded}
        icon={<ExpandIcon />}
        label="Expand"
        onClick={actions.onToggleExpanded}
      />
      <IconButton
        disabled={!actions.onClose}
        icon={<CloseIcon />}
        label="Close"
        onClick={actions.onClose}
      />
    </div>
  </header>
);
