import type { PointerEvent as ReactPointerEvent, ReactElement } from "react";

import {
  CloseIcon,
  CollapseIcon,
  ExpandIcon,
  NewChatIcon,
  SettingsIcon,
} from "#shared/assets/icons/panel-icons";
import { IconButton } from "#shared/ui/icon-button";
import type { PanelHeaderActions } from "../model/panel-actions.js";

export type PanelHeaderProps = {
  readonly actions?: PanelHeaderActions;
  readonly expanded?: boolean;
  readonly onDragStart?: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly settingsOpen?: boolean;
  readonly title: string;
};

export const PanelHeader = ({
  actions = {},
  expanded = false,
  onDragStart,
  settingsOpen = false,
  title,
}: PanelHeaderProps): ReactElement => (
  <header
    className="side-chat-widget__header relative flex cursor-move items-center justify-between gap-5 px-8 pt-12 pb-7 max-[720px]:cursor-default max-[720px]:px-5 max-[720px]:pt-6 max-[720px]:pb-4"
    onPointerDown={onDragStart}
  >
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
      {settingsOpen ? <SettingsMenu /> : null}
      <IconButton
        disabled={!actions.onToggleExpanded}
        icon={expanded ? <CollapseIcon /> : <ExpandIcon />}
        label={expanded ? "Exit fullscreen" : "Fullscreen"}
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

const SettingsMenu = (): ReactElement => (
  <section
    aria-label="Assistant settings"
    className="absolute top-24 right-16 z-30 w-80 rounded-lg border border-emerald-200 bg-white p-4 text-base text-emerald-950 shadow-xl shadow-slate-950/15 max-[720px]:right-5"
    data-sidechat-no-drag="true"
  >
    <div className="mb-2 text-sm font-semibold tracking-normal text-slate-500">
      Appearance
    </div>
    <div className="grid grid-cols-3 gap-2">
      {["Mint", "Slate", "Ivory"].map((label) => (
        <button
          className="rounded-md border border-emerald-200 px-3 py-2 text-left text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
          key={label}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  </section>
);
